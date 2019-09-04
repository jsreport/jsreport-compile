'use strict'

const util = require('util')
const path = require('path')
const fs = require('fs')
const shortid = require('shortid')
const defaultTmpDir = path.join(require('os').tmpdir(), 'jsreport')
const mkdirp = require('mkdirp')
const readFileAsync = util.promisify(fs.readFile)
const writeFileAsync = util.promisify(fs.writeFile)
const renameAsync = util.promisify(fs.rename)
const statAsync = util.promisify(fs.stat)
const chmodAsync = util.promisify(fs.chmod)

const mkdirpAsync = function (dir) {
  return new Promise((resolve, reject) => {
    mkdirp(dir, (err) => {
      if (err) {
        return reject(err)
      }

      resolve()
    })
  })
}

async function checkAndHandleRename (sourcePath, targetPath, tryCount = 0) {
  const maxRetries = 10

  if (fs.existsSync(targetPath)) {
    return
  }

  try {
    await renameAsync(sourcePath, targetPath)
  } catch (e) {
    if (tryCount < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      await checkAndHandleRename(sourcePath, targetPath, tryCount + 1)
    } else {
      throw e
    }
  }
}

/**
 * Class used to resolve resources and modules inside bundle
 * The instance is accessible on jsreport.execution
 */
class Execution {
  constructor (originalProjectDir, resources, version, shortid, tempDirectory) {
    this.originalProjectDir = originalProjectDir
    this.resources = resources

    // path where are stored resources like phantomjs.exe
    this.tmpPath = path.join(tempDirectory != null ? tempDirectory : defaultTmpDir, `compile`, `jsreport-${version}-${shortid}`)
  }

  resourcePath (name) {
    const resource = this.resources[name]

    if (resource.script === true) {
      throw new Error(`Can not get path for resource "${name}" because it is a script`)
    }

    let pathToEvaluate

    if (resource.temp === true) {
      pathToEvaluate = resource.pathInProject
    } else {
      pathToEvaluate = resource.path
    }

    const currentProjectDir = path.dirname(process.pkg.defaultEntrypoint)

    const resourcePath = pathToEvaluate.replace(this.originalProjectDir, currentProjectDir)

    return resourcePath
  }

  /** get path into resource located in temp */
  resourceTempPath (name) {
    return path.join(this.tmpPath, name)
  }

  get tempDirectory () {
    return this.tmpPath
  }

  /** Persist resources flaged with temp into the temp folder   */
  async createTempResources () {
    // if it already exists the resources are already there
    if (fs.existsSync(this.tmpPath)) {
      return
    }

    // we will write everything to a extract temp directory first
    // to ensure that parallel starts of the exe works
    const extractTmpPath = path.join(path.dirname(this.tmpPath), `~${path.basename(this.tmpPath)}-${shortid()}`)
    const tempResources = Object.keys(this.resources).filter((r) => this.resources[r].temp)

    if (fs.existsSync(extractTmpPath)) {
      throw new Error(`Temporary extract resources directory "${extractTmpPath}" exists`)
    }

    await Promise.all(tempResources.map(async (r) => {
      const filePath = path.join(extractTmpPath, r)

      try {
        await statAsync(filePath)
      } catch (e) {
        await mkdirpAsync(path.dirname(filePath))

        const rContent = await readFileAsync(this.resourcePath(r))

        await writeFileAsync(filePath, rContent)
        await chmodAsync(filePath, 0o777)
      }
    }))

    // when everything is saved into the extract temp directory we check the original temp directory
    // if it is empty then we rename the extract temp directory to the temp path
    await checkAndHandleRename(extractTmpPath, this.tmpPath)
  }

  async ensureTmpResources (resources) {
    try {
      await Promise.all(resources.map(async (resource) => {
        await statAsync(path.join(this.tmpPath, resource))
      }))
    } catch (e) {
      await this.createTempResources()
    }
  }
}

module.exports = Execution
