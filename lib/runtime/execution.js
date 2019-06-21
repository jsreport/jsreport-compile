'use strict'

const util = require('util')
const path = require('path')
const fs = require('fs')
const defaultTmpDir = path.join(require('os').tmpdir(), 'jsreport')
const mkdirp = require('mkdirp')
const readFileAsync = util.promisify(fs.readFile)
const writeFileAsync = util.promisify(fs.writeFile)
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

/**
 * Class used to resolve resources and modules inside bundle
 * The instance is accessible on jsreport.execution
 */
class Execution {
  constructor (resources, version, shortid, tempDirectory) {
    this.resources = resources

    // path where are stored resources like phantomjs.exe
    this.tmpPath = path.join(tempDirectory != null ? tempDirectory : defaultTmpDir, `compile`, `jsreport-${version}-${shortid}`)

    if (!fs.existsSync(this.tmpPath)) {
      mkdirp.sync(this.tmpPath)
    }
  }

  /**  */
  // resource (name) {
  //   if (!this.resources[name]) {
  //     return null
  //   }
  //
  //   return this._nexeres[this.resources[name].path]
  // }

  resourcePath (name) {
    const resource = this.resources[name]

    if (resource.script === true) {
      throw new Error(`Can not get path for resource "${name}" because it is a script`)
    }

    debugger

    return ''
  }

  /** get path into resource located in temp */
  resourceTempPath (name) {
    return path.join(this.tmpPath, name)
  }

  /** resolve path to additionaly included module in the bundle */
  // resolve (name) {
  //   return this.includes[name]
  // }

  /** Nexeres require is slow because it involves reading all resources, we do it lazily here */
  // get _nexeres () {
  //   return require(this.resourcesModuleId)
  // }

  get tempDirectory () {
    return this.tmpPath
  }

  /** Persist resources flaged with temp into the temp folder   */
  async createTempResources () {
    const tempResources = Object.keys(this.resources).filter((r) => this.resources[r].temp)

    await Promise.all(tempResources.map(async (r) => {
      const resource = this.resources[r]

      const filePath = resource.directory ? path.join(this.tmpPath, resource.directory, resource.pathInDirectory) : path.join(this.tmpPath, r)

      try {
        await statAsync(filePath)
      } catch (e) {
        await mkdirpAsync(path.dirname(filePath))

        const rContent = await readFileAsync(this.resourcePath(r))

        await writeFileAsync(filePath, rContent)
        await chmodAsync(filePath, 0o777)
      }
    }))
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
