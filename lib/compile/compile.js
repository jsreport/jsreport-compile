process.env.DEBUG = process.env.DEBUG || 'jsreport'

var debug = require('debug')('jsreport')
var path = require('path')
var Promise = require('bluebird')
var nexe = require('jsreport-nexe')
var os = require('os')
var readdirAsync = Promise.promisify(require('recursive-readdir'))
var fs = Promise.promisifyAll(require('fs'))
var nexeCompile = Promise.promisify(nexe.compile)
var patches = require('./patches')
var shortid = require('shortid')

function collectConfig (input) {
  debug('Temporary starting jsreport instance to collect configuration')

  var reporter = require(path.join(process.cwd(), input))

  if (!reporter) {
    return Promise.reject(new Error('Script ' + path.join(process.cwd(), input) + ' needs to module.exports a jsreport instance'))
  }

  var config = {
    resources: {
      'WinRun.exe': { path: path.relative(process.cwd(), path.join(path.dirname(require.resolve('silent-spawn')), 'WinRun.exe')), temp: true },
      'nssm.exe': { path: path.relative(process.cwd(), path.join(path.dirname(require.resolve('winser')), './bin/nssm.exe')), temp: true },
      'nssm64.exe': { path: path.relative(process.cwd(), path.join(path.dirname(require.resolve('winser')), './bin/nssm64.exe')), temp: true }
    },
    includes: {
      engineScript: './node_modules/jsreport-core/lib/render/engineScript.js',
      noneEngine: './node_modules/jsreport-core/lib/render/noneEngine.js',
      daemonInstance: './node_modules/jsreport-cli/lib/daemonInstance.js'
    },
    excludes: [],
    modules: []
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
function writeStartup (config, options) {
  debug('Writing final jsreport startup  code into %s', path.join(process.cwd(), 'jsreportStartup.js'))

  // append static require of extensions: jsreport.use(require('jsreport-templates')())
  var extensions = 'function requireExtensions() { return [' + config.extensions.map(function (e) {
    return 'require(\'./' + path.relative(process.cwd(), e.directory).replace(/\\/g, '/') + '\')'
  }).join(',') + '] }'

  var content = fs.readFileSync(path.join(__dirname, './startupTemplate.js'))
  content = content.toString()
    .replace('$includes', JSON.stringify(config.includes))
    .replace('$resources', JSON.stringify(config.resources))
    .replace('$shortid', shortid())
    .replace('$handleArguments', options.handleArguments !== false)
    .replace('$requireExtensions', extensions)
    .replace('$runtime', 'require(\'./' + path.relative(process.cwd(), path.join(__dirname, '../runtime/runtime.js')).replace(/\\/g, '/') + '\')')
    .replace('$afterInitScript', options.afterInitScript ? 'require(\'' + options.afterInitScript + '\')(jsreport)' : '')

  // final startup script availible as jsreportStartup.js'
  // I was not able to make it running from the build folder, we need to put it to curent directory
  // and remove it afterwards
  fs.writeFileSync(path.join(process.cwd(), 'jsreportStartup.js'), content)
}

// finaly run nexe to produce the exe
function compile (config, options) {
  debug('Bundling and compiling jsreport')
  var compileConfig = Object.assign({
    framework: 'nodejs',
    flags: true,
    standalone: 'jsreport',
    nodeVersion: '4.7.3',
    nodeTempDir: 'build',
    browserifyExcludes: ['try-thread-sleep'],
    browserifyRequires: [],
    resourceFiles: []
  }, options, { input: 'jsreportStartup.js' })

  // this should be probably part of jsreport-express, because simple-odata-server somewhere
  // tries to require it
  compileConfig.browserifyExcludes.push('mongodb')

  Object.keys(config.resources).forEach((k) => compileConfig.resourceFiles.push(config.resources[k].path))
  Object.keys(config.includes).forEach((k) => compileConfig.browserifyRequires.push({ file: config.includes[k] }))
  config.excludes.forEach((e) => compileConfig.browserifyExcludes.push(e))

  return nexeCompile(compileConfig).then(() => debug('Compile sucessfull, the output can be found at ' + compileConfig.output))
}

function validateResources (config) {
  return Promise.all(Object.keys(config.resources).map(function (rk) {
    return fs.statAsync(config.resources[rk].path).catch(function () {
      throw new Error('Resource ' + config.resources[rk].path + ' was not found')
    })
  }))
}

function validateIncludes (config) {
  return Promise.all(Object.keys(config.includes).map(function (rk) {
    return fs.statAsync(config.includes[rk]).catch(function () {
      throw new Error('Included external module ' + config.includes[rk] + ' was not found')
    })
  }))
}

module.exports = function (options) {
  debug('Compiling jsreport bootstrapped through %s into %s', options.input, options.output)
  return collectConfig(options.input).then(function (config) {
    return validateResources(config).then(function () {
      return validateIncludes(config).then(function () {
        writeStartup(config, options)
        patches()
        return compile(config, options)
      })
    })
  }).catch(function (e) {
    console.error(e)
    throw e
  }).finally(function () {
    return fs.unlinkAsync('jsreportStartup.js').catch(function () {})
  })
}
