process.env.DEBUG = process.env.DEBUG || 'jsreport'
require('./patches')()
var debug = require('debug')('jsreport')
var path = require('path')
var Promise = require('bluebird')
var omit = require('lodash.omit')
var nexe = require('jsreport-nexe')
var readdirAsync = Promise.promisify(require('recursive-readdir'))
var fs = Promise.promisifyAll(require('fs'))
var nexeCompile = Promise.promisify(nexe.compile)
var shortid = require('shortid')

function collectConfig (options) {
  var input = options.input

  debug('Temporary starting jsreport instance to collect configuration')

  process.env.JSREPORT_CLI = true

  var reporter = require(path.join(process.cwd(), input))

  if (!reporter) {
    return Promise.reject(new Error('Script ' + path.join(process.cwd(), input) + ' needs to module.exports a jsreport instance'))
  }

  var nodeTempDir = 'build-runtime'
  var resourcesId

  if (options.bundle) {
    resourcesId = './' + nodeTempDir + '/lib/nexeres.js'
  } else {
    resourcesId = 'nexeres'
  }

  var config = {
    version: undefined,
    runtime: path.join(__dirname, '../runtime/runtimeJsreport.js'),
    startupFilename: 'jsreportStartup.js',
    nodeTempDir: nodeTempDir,
    resourcesId: resourcesId,
    resources: {},
    includes: {
      engineScript: './node_modules/jsreport-core/lib/render/engineScript.js',
      noneEngine: './node_modules/jsreport-core/lib/render/noneEngine.js'
    },
    excludes: [
      'mongodb', 'coffee-script'
    ],
    modules: []
  }

  if (options.bundle) {
    // include resources in bundle mode
    config.includes['nexeres'] = resourcesId
  }

  // extend reporter with functions used by extension to include external modules and resources into the final bundle
  reporter.compilation = {
    // exclude all string arguments from the final jsreport bundle
    exclude: function () {
      config.excludes = config.excludes.concat(Array.prototype.slice.call(arguments))
    },
    // embed resource on the path p as the named resource
    // the resource can be returned inside bundle using jsrepoirt.execution.resource(name)
    resource: function (name, p) {
      config.resources[name] = { path: path.relative(process.cwd(), p) }
    },
    // attach resource on path p which will be availible as file in temp during bundle execution
    resourceInTemp: function (name, p) {
      config.resources[name] = { path: path.relative(process.cwd(), p), temp: true }
    },
    // attach resource on path p which will be availible as file in temp during bundle execution
    resourceDirectoryInTemp: function (name, p) {
      config.resources[name] = { path: path.relative(process.cwd(), p), temp: true, addAsDirectory: true }
    },
    // include external module in the bundle
    // the module can be resolved inside bundle using jsreport.execution.resolve(name)
    include: function (name, p) {
      config.includes[name] = './' + path.relative(process.cwd(), p).replace(/\\/g, '/')
    }
  }

  return reporter.init().then(function () {
    // set the version to use in the executable from the reporter version
    config.version = reporter.version
    config.extensions = reporter.extensionsManager.extensions
    debug('%s extensions will be bundled in')

    // the engines in jsreport are normaly required using full path, this won't work in bundle
    // we need to explictly include all external files like engine scripts
    reporter.extensionsManager.engines.forEach(function (e) {
      config.includes[e.name] = './' + path.relative(process.cwd(), e.pathToEngine).replace(/\\/g, '/')
    })

    // include all engine nativeModules to make the extensions' code easier
    reporter.options.tasks.nativeModules.forEach(function (e) {
      config.includes[e.module] = './' + path.relative(process.cwd(), e.module).replace(/\\/g, '/')
    })

    // the same for modules
    reporter.options.tasks.modules.forEach(function (m) {
      config.modules.push(m)
      config.includes[m.alias] = './' + path.relative(process.cwd(), m.path).replace(/\\/g, '/')
    })

    return Promise.map(Object.keys(config.resources).filter((r) => config.resources[r].addAsDirectory), (d) => {
      return readdirAsync(path.join(process.cwd(), config.resources[d].path)).then((files) => {
        files.forEach((f) => {
          const relativeFilePath = path.relative(process.cwd(), f)
          config.resources[relativeFilePath] = {
            path: relativeFilePath,
            temp: true,
            directory: d,
            pathInDirectory: path.relative(path.join(process.cwd(), config.resources[d].path), f)
          }
        })
      }).then(() => delete config.resources[d])
    }).then(() => config)
  })
}

// use template startupTemplate.js to built startup script using string replacement
function writeStartup (label, config, options) {
  debug('Writing final ' + label + ' startup  code into %s', path.join(process.cwd(), 'jsreportStartup.js'))

  // append static require of extensions: jsreport.use(require('jsreport-templates')())
  var extensions = 'function requireExtensions() { return [' + (
    config.extensions.length === 0 ? '' : config.extensions.map(function (e) {
      return 'require(\'./' + path.relative(process.cwd(), e.directory).replace(/\\/g, '/') + '\')'
    }).join(',')
  ) + '] }'

  var content = fs.readFileSync(path.join(__dirname, './startupTemplate.js'))
  content = content.toString()
    .replace('$version', config.version)
    .replace('$includes', JSON.stringify(config.includes))
    .replace('$resources', JSON.stringify(config.resources))
    .replace('$shortid', config.shortid)
    .replace('$jsreportRuntimeId', config.jsreportRuntimeId || '')
    .replace('$resourcesId', config.resourcesId)
    .replace('$handleArguments', options.handleArguments !== false)
    .replace('$requireExtensions', extensions)
    .replace('$runtime', 'require(\'./' + path.relative(process.cwd(), config.runtime).replace(/\\/g, '/') + '\')')

  // final startup script availible as jsreportStartup.js'
  // I was not able to make it running from the build folder, we need to put it to curent directory
  // and remove it afterwards
  fs.writeFileSync(path.join(process.cwd(), config.startupFilename), content)
}

// finaly run nexe to produce the exe
function compile (label, config, options) {
  debug('Bundling and compiling ' + label)

  var compileConfig = Object.assign({
    framework: 'nodejs',
    flags: true,
    standalone: 'jsreport',
    nodeVersion: options.nodeVersion,
    nodeTempDir: config.nodeTempDir,
    browserifyExcludes: ['try-thread-sleep'],
    browserifyRequires: [],
    resourceFiles: []
  }, options, { input: config.startupFilename })

  if (Array.isArray(config.resources)) {
    // multi resource format
    compileConfig.resourceFiles = {}

    config.resources.forEach((res) => {
      compileConfig.resourceFiles[res.name] = []
      Object.keys(res.files).forEach((k) => compileConfig.resourceFiles[res.name].push(res.files[k].path))
    })
  } else {
    Object.keys(config.resources).forEach((k) => compileConfig.resourceFiles.push(config.resources[k].path))
  }

  Object.keys(config.includes).forEach((k) => compileConfig.browserifyRequires.push({ file: config.includes[k] }))

  config.excludes.forEach((e) => compileConfig.browserifyExcludes.push(e))

  return nexeCompile(compileConfig).then(() => {
    debug('Compile ' + label + ' sucessfull, the output can be found at ' + compileConfig.output)

    return compileConfig
  })
}

function validateResources (resources) {
  return Promise.all(Object.keys(resources).map(function (rk) {
    return fs.statAsync(resources[rk].path).catch(function () {
      throw new Error('Resource ' + resources[rk].path + ' was not found')
    })
  }))
}

function validateIncludes (includes) {
  return Promise.all(Object.keys(includes).map(function (rk) {
    return fs.statAsync(includes[rk]).catch(function () {
      throw new Error('Included external module ' + includes[rk] + ' was not found')
    })
  }))
}

function prepareJsreport (id, options) {
  debug('Compiling jsreport bootstrapped through %s into %s', options.input, options.output)

  return collectConfig(options).then(function (config) {
    config.shortid = id

    return validateResources(config.resources).then(function () {
      return validateIncludes(omit(config.includes, ['nexeres'])).then(function () {
        writeStartup('jsreport', config, options)

        return config
      })
    })
  })
}

function compileJsreport (config, options) {
  var customConfig = config

  if (!options.bundle) {
    // in exe mode don't include the resources of jsreport runtime directly in the bundle,
    // the resources will be available from the executable
    customConfig = Object.assign({}, config, {
      resources: {}
    })
  }

  return compile('jsreport', customConfig, Object.assign({}, options, {
    // jsreport should be always a bundle
    bundle: true,
    standalone: 'jsreportRuntime',
    output: 'jsreportRuntime.js'
  })).then((compileConfig) => {
    return {
      config: config,
      compileConfig: compileConfig
    }
  })
}

function compileExe (id, jsreportInfo, options) {
  var nodeTempDir = 'build'

  var resourcesId
  var jsreportRuntimeId

  if (options.bundle) {
    resourcesId = './' + path.relative(process.cwd(), path.join(nodeTempDir, 'lib/nexeres.js'))
    jsreportRuntimeId = './jsreportRuntime.js'
  } else {
    resourcesId = 'nexeres-ligth'
    jsreportRuntimeId = 'jsreportRuntime'
  }

  var config = {
    shortid: id,
    version: jsreportInfo.config.version,
    runtime: path.join(__dirname, '../runtime/runtime.js'),
    startupFilename: 'exeStartup.js',
    nodeTempDir: nodeTempDir,
    extensions: [],
    jsreportRuntimeId: jsreportRuntimeId,
    resourcesId: resourcesId,
    resources: {
      'WinRun.exe': { path: path.relative(process.cwd(), path.join(path.dirname(require.resolve('silent-spawn')), 'WinRun.exe')), temp: true },
      'nssm.exe': { path: path.relative(process.cwd(), path.join(path.dirname(require.resolve('winser-with-api')), './bin/nssm.exe')), temp: true },
      'nssm64.exe': { path: path.relative(process.cwd(), path.join(path.dirname(require.resolve('winser-with-api')), './bin/nssm64.exe')), temp: true }
    },
    includes: {
      daemonInstance: './node_modules/jsreport-cli/lib/daemonInstance.js'
    },
    excludes: [],
    modules: []
  }

  if (options.bundle) {
    // include resources in bundle mode
    config.includes['nexeres-ligth'] = resourcesId
    config.includes['jsreportRuntime'] = jsreportRuntimeId
  } else {
    config.excludes.push('jsreportRuntime')
  }

  debug('Compiling final executable..')

  return validateResources(config.resources).then(function () {
    return validateIncludes(omit(config.includes, ['nexeres-ligth']))
  }).then(function () {
    var compileConfig
    var opts

    writeStartup('executable', config, options)

    if (options.bundle) {
      // tell browserify to not try to parse our jsreport runtime bundle
      // it is important that we pass an absolute path here,
      // otherwise browserify won't take it into account
      opts = {
        noParse: [path.resolve('./jsreportRuntime.js')],
        ignoreInGlobalTransform: [path.resolve('./jsreportRuntime.js')]
      }

      compileConfig = config
    } else {
      opts = {
        libs: [path.join(process.cwd(), 'jsreportRuntime.js')]
      }

      // in exe mode include multiple resources
      compileConfig = Object.assign({}, config, {
        resources: [{
          name: 'nexeres-ligth',
          files: config.resources
        }, {
          name: 'nexeres',
          files: jsreportInfo.config.resources
        }]
      })
    }

    return compile('executable', compileConfig, Object.assign({}, options, opts))
  })
}

module.exports = function (options) {
  var nodeVersion = '8.8.1'
  var id = shortid()

  options.nodeVersion = nodeVersion

  return Promise.resolve(prepareJsreport(id, options)).then(function (config) {
    // creating jsreport bundle
    return compileJsreport(config, options)
  }).then(function (jsreportInfo) {
    // creating the final exe
    return compileExe(id, jsreportInfo, options)
  }).catch(function (e) {
    console.error(e)
    throw e
  }).finally(function () {
    return Promise.all([
      fs.unlinkAsync('jsreportStartup.js'),
      fs.unlinkAsync('exeStartup.js'),
      fs.unlinkAsync('jsreportRuntime.js')
    ]).catch(function () {})
  })
}
