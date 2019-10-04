process.env.DEBUG = process.env.DEBUG || 'jsreport'

const debug = require('debug')('jsreport')
const util = require('util')
const path = require('path')
const shortid = require('shortid')
const fs = require('fs')
const pkg = require('@bjrmatos/pkg')
const rimraf = require('rimraf')
const rimrafAsync = util.promisify(rimraf)
const readFileAsync = util.promisify(fs.readFile)
const writeFileAsync = util.promisify(fs.writeFile)
const statAsync = util.promisify(fs.stat)
const unlinkAsync = util.promisify(fs.unlink)

async function collectConfig (input) {
  debug('Temporary starting jsreport instance to collect configuration')

  process.env.JSREPORT_CLI = true

  const reporter = require(input)

  if (!reporter) {
    throw new Error(`Script ${input} needs to module.exports a jsreport instance`)
  }

  const config = {
    version: undefined,
    resources: {}
  }

  // extend reporter with functions used by extension to include external modules and resources into the executable
  reporter.compilation = {
    script: function (name, p) {
      const projectDir = process.cwd()

      const pathRelativeToProject = path.relative(projectDir, p)
      const isInsideProjectPath = pathRelativeToProject.length > 0 && !pathRelativeToProject.startsWith('..') && !path.isAbsolute(pathRelativeToProject)

      if (!isInsideProjectPath) {
        throw new Error(`script resource can only be a file inside project "${projectDir}", resource path: ${p}. make sure to pass file that is part of project`)
      }

      config.resources[name] = { path: p, script: true }
    },
    // add file as asset to the compilation
    resource: function (name, p) {
      const projectDir = process.cwd()

      const pathRelativeToProject = path.relative(projectDir, p)
      const isInsideProjectPath = pathRelativeToProject.length > 0 && !pathRelativeToProject.startsWith('..') && !path.isAbsolute(pathRelativeToProject)

      if (!isInsideProjectPath) {
        throw new Error(`resource can only be a file inside project "${projectDir}", resource path: ${p}. make sure to pass file that is part of project`)
      }

      config.resources[name] = { path: p }
    },
    // add file as asset to the compilation but copy it to temp directory at startup
    resourceInTemp: function (name, p) {
      config.resources[name] = { path: p, temp: true }
    }
  }

  await reporter.init()

  // set the version to use in the executable from the reporter version
  config.version = reporter.version
  // includes all the extensions detected, included the disabled ones, because they can be enabled with configuration
  // and we need to include those extensions too in the compilation
  config.extensions = reporter.extensionsManager.availableExtensions

  debug('%s extensions will be bundled in', config.extensions.length)

  if (reporter.cli) {
    config.extensionsCommands = await reporter.cli.findCommandsInExtensions()
  } else {
    config.extensionsCommands = []
  }

  return config
}

// use template startupTemplate.js to built startup script using string replacement
async function writeStartup (config, options) {
  const startupFilePath = path.join(process.cwd(), 'jsreportStartup.js')
  const entryPointPath = options.input
  const runtimePath = path.join(__dirname, '../runtime/runtime.js')

  options.exeInput = 'jsreportStartup.js'

  debug('Writing startup code into %s', startupFilePath)

  // append static require of the extensions detected: jsreport.use(require('jsreport-templates')())
  const extensions = `function requireExtensions() { return [\n${
    config.extensions.length === 0 ? '' : config.extensions.map((e) => {
      const extWithCommands = config.extensionsCommands.find((ex) => ex.extension === e.name)

      let cliModulePath

      if (extWithCommands != null) {
        cliModulePath = extWithCommands.cliModulePath
      }

      return `Object.assign(require('./${
        path.relative(process.cwd(), e.directory).replace(/\\/g, '/')
      }'), { source: '${e.source}', version: '${e.version}', cliModule: ${cliModulePath == null ? 'false' : `require('./${
        path.relative(process.cwd(), cliModulePath).replace(/\\/g, '/')
      }')`} })`
    }).join(',\n')
  }\n] }`

  const cliExtensionsCommands = `function requireCliExtensionsCommands() { return [\n${
    config.extensionsCommands.length === 0 ? '' : config.extensionsCommands.map((e) => {
      const cliModulePath = e.cliModulePath

      return `require('./${
        path.relative(process.cwd(), cliModulePath).replace(/\\/g, '/')
      }')`
    }).join(',\n')
  }\n] }`

  let content = fs.readFileSync(path.join(__dirname, './startupTemplate.js'))

  content = content.toString()
  .replace('$originalProjectDir', JSON.stringify(process.cwd()))
  .replace('$shortid', config.shortid)
    .replace('$version', config.version)
    .replace('$resources', JSON.stringify(config.resources))
    .replace('$handleArguments', options.handleArguments !== false)
    .replace('$requireExtensions', extensions)
    .replace('$requireCliExtensionsCommands', cliExtensionsCommands)
    .replace('$runtime', 'require(\'./' + path.relative(process.cwd(), runtimePath).replace(/\\/g, '/') + '\')')
    .replace('$entryPoint', 'require(\'./' + path.relative(process.cwd(), entryPointPath).replace(/\\/g, '/') + '\')')

  // final startup script available
  fs.writeFileSync(startupFilePath, content)
}

async function validateResources (resources) {
  await Promise.all(Object.keys(resources).map(async (rk) => {
    try {
      await statAsync(resources[rk].path)
    } catch (e) {
      throw new Error(`Resource ${resources[rk].path} was not found`)
    }
  }))
}

async function copyTempResourcesToProject (resources) {
  const tempResources = Object.keys(resources).filter((rName) => {
    return resources[rName].temp === true
  })

  const tempResourcesDirectory = path.join(process.cwd(), 'exe-temp-resources')

  try {
    fs.mkdirSync(tempResourcesDirectory)
  } catch (e) {
    if (e.code !== 'EEXIST') {
      throw e
    }
  }

  await Promise.all(tempResources.map(async (tempRName) => {
    const resource = resources[tempRName]
    const pathInProject = path.join(tempResourcesDirectory, tempRName)

    resource.pathInProject = pathInProject

    const resourceContent = await readFileAsync(resource.path)

    await writeFileAsync(pathInProject, resourceContent)
  }))
}

// finaly run nexe to produce the exe
async function compileExe (label, config, options) {
  debug(`Compiling ${label} executable`)

  let execArgs = [options.exeInput]

  if (options.debug) {
    execArgs.push('--debug')
  }

  execArgs.push('--target')
  execArgs.push(`node${options.nodeVersion}`)

  if (Object.keys(config.resources).length > 0) {
    const scripts = Object.keys(config.resources).filter((rName) => {
      return config.resources[rName].script === true
    }).map((rName) => {
      const resource = config.resources[rName]

      // the path in pkg configuration should be relative to project dir
      return path.relative(process.cwd(), resource.path)
    })

    const assets = Object.keys(config.resources).filter((rName) => {
      return config.resources[rName].script !== true
    }).map((rName) => {
      const resource = config.resources[rName]
      let pathToUse

      if (resource.temp === true) {
        pathToUse = resource.pathInProject
      } else {
        pathToUse = resource.path
      }

      // the path in pkg configuration should be relative to project dir
      return path.relative(process.cwd(), pathToUse)
    })

    const pkfConfigJSONPath = path.join(process.cwd(), 'jsreportPkgConfig.json')

    let filesToIgnore = []

    filesToIgnore.push('node_modules/**/Jenkinsfile')
    filesToIgnore.push('node_modules/**/Makefile')
    filesToIgnore.push('node_modules/**/Gulpfile.js')
    filesToIgnore.push('node_modules/**/Gruntfile.js')
    filesToIgnore.push('node_modules/**/gulpfile.js')
    filesToIgnore.push('node_modules/**/.DS_Store')
    filesToIgnore.push('node_modules/**/.tern-project')
    filesToIgnore.push('node_modules/**/.gitattributes')
    filesToIgnore.push('node_modules/**/.editorconfig')
    filesToIgnore.push('node_modules/**/.eslintrc')
    filesToIgnore.push('node_modules/**/.eslintrc.js')
    filesToIgnore.push('node_modules/**/.eslintrc.json')
    filesToIgnore.push('node_modules/**/.eslintrc.yml')
    filesToIgnore.push('node_modules/**/.eslintignore')
    filesToIgnore.push('node_modules/**/.stylelintrc')
    filesToIgnore.push('node_modules/**/stylelint.config.js')
    filesToIgnore.push('node_modules/**/.stylelintrc.json')
    filesToIgnore.push('node_modules/**/.stylelintrc.yaml')
    filesToIgnore.push('node_modules/**/.stylelintrc.yml')
    filesToIgnore.push('node_modules/**/.stylelintrc.js')
    filesToIgnore.push('node_modules/**/.htmllintrc')
    filesToIgnore.push('node_modules/**/.lint')
    filesToIgnore.push('node_modules/**/.npmrc')
    filesToIgnore.push('node_modules/**/.npmignore')
    filesToIgnore.push('node_modules/**/.jshintrc')
    filesToIgnore.push('node_modules/**/.flowconfig')
    filesToIgnore.push('node_modules/**/.documentup.json')
    filesToIgnore.push('node_modules/**/.yarn-metadata.json')
    filesToIgnore.push('node_modules/**/.travis.yml')
    filesToIgnore.push('node_modules/**/appveyor.yml')
    filesToIgnore.push('node_modules/**/.gitlab-ci.yml')
    filesToIgnore.push('node_modules/**/circle.yml')
    filesToIgnore.push('node_modules/**/.coveralls.yml')
    filesToIgnore.push('node_modules/**/CHANGES')
    filesToIgnore.push('node_modules/**/changelog')
    filesToIgnore.push('node_modules/**/LICENSE.txt')
    filesToIgnore.push('node_modules/**/LICENSE')
    filesToIgnore.push('node_modules/**/LICENSE-MIT')
    filesToIgnore.push('node_modules/**/LICENSE-MIT.txt')
    filesToIgnore.push('node_modules/**/LICENSE.BSD')
    filesToIgnore.push('node_modules/**/license')
    filesToIgnore.push('node_modules/**/LICENCE.txt')
    filesToIgnore.push('node_modules/**/LICENCE')
    filesToIgnore.push('node_modules/**/LICENCE-MIT')
    filesToIgnore.push('node_modules/**/LICENCE-MIT.txt')
    filesToIgnore.push('node_modules/**/LICENCE.BSD')
    filesToIgnore.push('node_modules/**/licence')
    filesToIgnore.push('node_modules/**/AUTHORS')
    filesToIgnore.push('node_modules/**/VERSION')
    filesToIgnore.push('node_modules/**/CONTRIBUTORS')
    filesToIgnore.push('node_modules/**/.yarn-integrity')
    filesToIgnore.push('node_modules/**/.yarnclean')
    filesToIgnore.push('node_modules/**/_config.yml')
    filesToIgnore.push('node_modules/**/.babelrc')
    filesToIgnore.push('node_modules/**/.yo-rc.json')
    filesToIgnore.push('node_modules/**/jest.config.js')
    filesToIgnore.push('node_modules/**/karma.conf.js')
    filesToIgnore.push('node_modules/**/wallaby.js')
    filesToIgnore.push('node_modules/**/wallaby.conf.js')
    filesToIgnore.push('node_modules/**/.prettierrc')
    filesToIgnore.push('node_modules/**/.prettierrc.yml')
    filesToIgnore.push('node_modules/**/.prettierrc.toml')
    filesToIgnore.push('node_modules/**/.prettierrc.js')
    filesToIgnore.push('node_modules/**/.prettierrc.json')
    filesToIgnore.push('node_modules/**/prettier.config.js')
    filesToIgnore.push('node_modules/**/.appveyor.yml')
    filesToIgnore.push('node_modules/**/tsconfig.json')
    filesToIgnore.push('node_modules/**/tslint.json')

    filesToIgnore.push('node_modules/**/*.markdown')
    filesToIgnore.push('node_modules/**/*.md')
    filesToIgnore.push('node_modules/**/*.mkd')
    filesToIgnore.push('node_modules/**/*.ts')
    filesToIgnore.push('node_modules/**/*.d.ts')
    filesToIgnore.push('node_modules/**/*.jst')
    filesToIgnore.push('node_modules/**/*.coffee')
    filesToIgnore.push('node_modules/**/*.swp')
    filesToIgnore.push('node_modules/**/*.tgz')

    filesToIgnore.push('node_modules/**/*.map')
    filesToIgnore.push('node_modules/**/*.css.map')
    filesToIgnore.push('node_modules/**/*.js.map')
    filesToIgnore.push('node_modules/**/*.min.js.map')

    filesToIgnore.push('node_modules/**/test/**/*')
    filesToIgnore.push('node_modules/**/tests/**/*')
    filesToIgnore.push('node_modules/**/.idea/**/*')
    filesToIgnore.push('node_modules/**/.vscode/**/*')
    filesToIgnore.push('node_modules/**/.github/**/*')

    filesToIgnore.push('node_modules/bluebird/js/browser')
    filesToIgnore.push('node_modules/mingo/dist')
    filesToIgnore.push('!node_modules/mingo/dist/mingo.js')
    filesToIgnore.push('!node_modules/diff2html/dist')
    filesToIgnore.push('node_modules/**/async/dist/async.min.js')
    filesToIgnore.push('node_modules/pako/dist')
    filesToIgnore.push('node_modules/ajv/dist')
    filesToIgnore.push('node_modules/handlebars/bin')
    filesToIgnore.push('node_modules/handlebars/lib')
    filesToIgnore.push('!node_modules/handlebars/lib/index.js')
    filesToIgnore.push('node_modules/handlebars/dist')
    filesToIgnore.push('!node_modules/handlebars/dist/cjs')
    filesToIgnore.push('node_modules/silent-spawn/WinRun.exe')

    filesToIgnore = config.extensions.reduce((acu, ext) => {
      const rootDir = path.relative(process.cwd(), ext.directory)

      acu.push(path.join(rootDir, 'studio'))
      acu.push(`!${path.join(rootDir, 'studio/main.js')}`)
      acu.push(`!${path.join(rootDir, 'studio/main.css')}`)

      if (ext.name === 'studio') {
        acu.push(path.join(rootDir, 'src'))
        acu.push(path.join(rootDir, 'webpack'))
      }

      return acu
    }, filesToIgnore)

    await writeFileAsync(pkfConfigJSONPath, JSON.stringify({
      pkg: {
        scripts,
        assets,
        ignore: filesToIgnore
      }
    }, null, 2))

    execArgs.push('--config')
    execArgs.push(pkfConfigJSONPath)
  }

  if (options.debug) {
    execArgs.push('--vfsOutput')
    execArgs.push(path.join(process.cwd(), 'vfs.json'))
  }

  execArgs.push('--externalModules')

  execArgs.push('--output')
  execArgs.push(options.output)

  debug(`Calling pkg compilation with args: ${execArgs.join(' ')}`)

  await pkg.exec(execArgs)

  debug(`Compile ${label} sucessfull, the output can be found at ${path.join(process.cwd(), options.output)}`)
}

async function prepareJsreport (id, options) {
  const config = await collectConfig(options.input)
  return config
}

module.exports = async (options) => {
  const id = shortid()

  options.input = path.resolve(process.cwd(), options.input)

  try {
    // starting a jsreport instance to collect config
    const config = await prepareJsreport(id, options)

    config.shortid = id

    await validateResources(config.resources)

    await copyTempResourcesToProject(config.resources)

    await writeStartup(config, options)

    // compile jsreport binary
    await compileExe('jsreport', config, options)

    await cleanup()
  } catch (e) {
    await cleanup()

    console.error(e)
    throw e
  }

  function cleanup () {
    if (options.debug) {
      return Promise.resolve()
    }

    return Promise.all([
      unlinkAsync(path.join(process.cwd(), 'jsreportStartup.js')).catch(() => {}),
      unlinkAsync(path.join(process.cwd(), 'jsreportPkgConfig.json')).catch(() => {}),
      rimrafAsync(path.join(process.cwd(), 'exe-temp-resources')).catch(() => {})
    ])
  }
}
