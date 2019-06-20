process.env.DEBUG = process.env.DEBUG || 'jsreport'

const debug = require('debug')('jsreport')
const util = require('util')
const path = require('path')
const omit = require('lodash.omit')
const shortid = require('shortid')
const fs = require('fs')
const pkg = require('pkg')
const readdirAsync = util.promisify(require('recursive-readdir'))
const statAsync = util.promisify(fs.stat)
const unlinkAsync = util.promisify(fs.unlink)

async function validateResources (resources) {
  await Promise.all(Object.keys(resources).map(async (rk) => {
    try {
      await statAsync(resources[rk].path)
    } catch (e) {
      throw new Error(`Resource ${resources[rk].path} was not found`)
    }
  }))
}

async function validateIncludes (includes) {
  await Promise.all(Object.keys(includes).map(async (rk) => {
    try {
      await statAsync(includes[rk])
    } catch (e) {
      throw new Error(`Included external module ${includes[rk]} was not found`)
    }
  }))
}

async function collectConfig (input) {
  debug('Temporary starting jsreport instance to collect configuration')

  process.env.JSREPORT_CLI = true

  const reporter = require(path.join(process.cwd(), input))

  if (!reporter) {
    throw new Error(`Script ${path.join(process.cwd(), input)} needs to module.exports a jsreport instance`)
  }

  const config = {
    version: undefined,
    // runtime: path.join(__dirname, '../runtime/runtimeJsreport.js'),
    // startupFilename: 'jsreportStartup.js',
    // nodeTempDir: nodeTempDir,
    // resourcesId: resourcesId,
    resources: {},
    includes: {
      // engineScript: './node_modules/jsreport-core/lib/render/engineScript.js',
      // safeSandbox: './node_modules/jsreport-core/lib/render/safeSandbox.js',
      // noneEngine: './node_modules/jsreport-core/lib/render/noneEngine.js'
    },
    excludes: [
      // 'mongodb', 'coffee-script'
    ],
    modules: []
  }

  // extend reporter with functions used by extension to include external modules and resources into the final bundle
  // reporter.compilation = {
  //   // exclude all string arguments from the final jsreport bundle
  //   exclude: function () {
  //     config.excludes = config.excludes.concat(Array.prototype.slice.call(arguments))
  //   },
  //   // embed resource on the path p as the named resource
  //   // the resource can be returned inside bundle using jsrepoirt.execution.resource(name)
  //   resource: function (name, p) {
  //     config.resources[name] = { path: path.relative(process.cwd(), p) }
  //   },
  //   // attach resource on path p which will be available as file in temp during bundle execution
  //   resourceInTemp: function (name, p) {
  //     config.resources[name] = { path: path.relative(process.cwd(), p), temp: true }
  //   },
  //   // attach resource on path p which will be available as file in temp during bundle execution
  //   resourceDirectoryInTemp: function (name, p) {
  //     config.resources[name] = { path: path.relative(process.cwd(), p), temp: true, addAsDirectory: true }
  //   },
  //   // include external module in the bundle
  //   // the module can be resolved inside bundle using jsreport.execution.resolve(name)
  //   include: function (name, p) {
  //     config.includes[name] = './' + path.relative(process.cwd(), p).replace(/\\/g, '/')
  //   }
  // }

  await reporter.init()

  // set the version to use in the executable from the reporter version
  config.version = reporter.version
  config.extensions = reporter.extensionsManager.extensions

  debug('%s extensions will be bundled in', config.extensions.length)

  if (reporter.cli) {
    config.extensionsCommands = await reporter.cli.findCommandsInExtensions()
  } else {
    config.extensionsCommands = []
  }

  // const resourcesAsDirectory = Object.keys(config.resources).filter((r) => config.resources[r].addAsDirectory)

  // await Promise.all(resourcesAsDirectory.map(async (dir) => {
  //   const files = await readdirAsync(path.join(process.cwd(), config.resources[d].path))
  //
  //   files.forEach((f) => {
  //     const relativeFilePath = path.relative(process.cwd(), f)
  //
  //     config.resources[relativeFilePath] = {
  //       path: relativeFilePath,
  //       temp: true,
  //       directory: d,
  //       pathInDirectory: path.relative(path.join(process.cwd(), config.resources[d].path), f)
  //     }
  //   })
  //
  //   delete config.resources[dir]
  // }))

  return config
}

// use template startupTemplate.js to built startup script using string replacement
async function writeStartup (config, options) {
  const startupFilePath = path.join(process.cwd(), 'jsreportStartup.js')
  const runtimePath = path.join(__dirname, '../runtime/runtime.js')

  debug('Writing startup code into %s', startupFilePath)

  let extendConfigFn

  try {
    const pathToExtendConfig = require.resolve('jsreport/lib/extendConfig.js')

    extendConfigFn = `require('./${
      path.relative(process.cwd(), pathToExtendConfig).replace(/\\/g, '/')
    }')`
  } catch (e) {}

  if (!extendConfigFn) {
    extendConfigFn = 'null'
  }

  // append static require of the extensions detected: jsreport.use(require('jsreport-templates')())
  const extensions = `function requireExtensions() { return [${
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
    }).join(',')
  }] }`

  const cliExtensionsCommands = `function requireCliExtensionsCommands() { return [${
    config.extensionsCommands.length === 0 ? '' : config.extensionsCommands.map((e) => {
      const cliModulePath = e.cliModulePath

      return `require('./${
        path.relative(process.cwd(), cliModulePath).replace(/\\/g, '/')
      }')`
    }).join(',')
  }] }`

  let content = fs.readFileSync(path.join(__dirname, './startupTemplate.js'))

  content = content.toString()
    .replace('$version', config.version)
    .replace('$includes', JSON.stringify(config.includes))
    .replace('$resources', JSON.stringify(config.resources))
    .replace('$shortid', config.shortid)
    .replace('$handleArguments', options.handleArguments !== false)
    .replace('$requireExtensions', extensions)
    .replace('$requireCliExtensionsCommands', cliExtensionsCommands)
    .replace('$extendConfigFn', extendConfigFn)
    .replace('$runtime', 'require(\'./' + path.relative(process.cwd(), runtimePath).replace(/\\/g, '/') + '\')')

  // final startup script available
  fs.writeFileSync(startupFilePath, content)
}

// finaly run nexe to produce the exe
async function compileExe (label, config, options) {
  await validateResources(config.resources)

  await validateIncludes(config.includes)

  debug(`Compiling ${label} executable`)

  // browserifyExcludes: ['try-thread-sleep', 'uws'],

  // resources: {
  //   'WinRun.exe': { path: path.relative(process.cwd(), path.join(path.dirname(require.resolve('silent-spawn')), 'WinRun.exe')), temp: true },
  //   'nssm.exe': { path: path.relative(process.cwd(), path.join(path.dirname(require.resolve('winser-with-api')), './bin/nssm.exe')), temp: true },
  //   'nssm64.exe': { path: path.relative(process.cwd(), path.join(path.dirname(require.resolve('winser-with-api')), './bin/nssm64.exe')), temp: true }
  // },
  // includes: {
  //   daemonInstance: './node_modules/jsreport-cli/lib/daemonInstance.js'
  // }

  let execArgs = [options.input]

  if (options.debug) {
    execArgs.push('--debug')
  }

  execArgs.push('--target')
  execArgs.push(`node${options.nodeVersion}`)

  execArgs.push('--output')
  execArgs.push(options.output)

  debug(`Calling pkg compilation with args: ${execArgs.join(' ')}`)

  await pkg.exec(execArgs)

  debug(`Compile ${label} sucessfull, the output can be found at ${path.join(process.cwd(), options.output)}`)
}

async function prepareJsreport (id, options) {
  const config = await collectConfig(options.input)

  config.shortid = id

  await writeStartup(config, options)

  return config
}

module.exports = async (options) => {
  const nodeVersion = '8.16.0'
  const id = shortid()

  options.nodeVersion = nodeVersion

  try {
    // starting a jsreport instance to collect config
    const config = await prepareJsreport(id, options)

    config.shortid = id

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

    return unlinkAsync('jsreportStartup.js').catch(() => {})
  }
}
