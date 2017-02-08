
var path = require('path')
var Promise = require('bluebird')
var nexe = require('nexe')
var os = require('os')
var fs = Promise.promisifyAll(require('fs'))
var nexeCompile = Promise.promisify(nexe.compile)
var patches = require('./patches')

function collectConfig (entryPoint) {
  var reporter = require(entryPoint)
  var config = {
    resources: {},
    includes: {
      engineScript: './node_modules/jsreport-core/lib/render/engineScript.js',
      noneEngine: './node_modules/jsreport-core/lib/render/noneEngine.js'
    },
    excludes: []
  }

  reporter.compilation = {
    exclude: function () {
      config.excludes = config.excludes.concat(Array.prototype.slice.call(arguments))
    },
    resource: function (name, p) {
      config.resources[name] = { path: path.relative(path.join(__dirname, '../'), p) }
    },
    resourceInTemp: function (name, p) {
      config.resources[name] = { path: path.relative(path.join(__dirname, '../'), p), temp: true }
    },
    include: function (name, p) {
      config.includes[name] = './' + path.relative(path.join(__dirname, '../'), p).replace(/\\/g, '/')
    },
    attach: function (opts) {

    }
  }

  // how to exclude studio with option??
  // paths now...

  // reporter.options.express.enabled = false

  return reporter.init().then(function () {
    config.extensions = reporter.extensionsManager.extensions
    return config
  })
}

function writeStartup (config, options) {
  var extensions = config.extensions.map(function (e) {
    return 'jsreport.use(require(\'./' + path.relative(path.join(__dirname, '../'), e.directory).replace(/\\/g, '/') + '\')())'
  }).join(os.EOL)

  var resources = os.EOL + 'var resources = ' + JSON.stringify(config.resources) + os.EOL
  var includes = os.EOL + 'var includes = ' + JSON.stringify(config.includes) + os.EOL

  var content = fs.readFileSync(path.join(__dirname, './startupTemplate.js'))
  content = content.toString()
    .replace('$setup', resources + includes)
    .replace('$extensions', extensions)
    .replace('$afterInitScript', options.afterInitScript ? 'require(\'' + options.afterInitScript + '\')(jsreport)' : '')

  fs.writeFileSync(path.join(__dirname, '../startup.js'), includes + resources + content)
}

function compile (config) {
  var compileConfig = {
    output: 'jsreport.exe',
    input: 'startup.js',
    framework: 'nodejs',
    flags: true,
    nodeVersion: '7.4.0',
    nodeTempDir: 'build',
    browserifyExcludes: ['mongodb'],
    browserifyRequires: [],
    resourceFiles: []
  }

  Object.keys(config.resources).forEach(function (k) {
    compileConfig.resourceFiles.push(config.resources[k].path)
  })

  Object.keys(config.includes).forEach(function (k) {
    compileConfig.browserifyRequires.push({ file: config.includes[k] })
  })

  config.excludes.forEach(function (e) {
    compileConfig.browserifyExcludes.push(e)
  })

  return nexeCompile(compileConfig)
}

module.exports = function (options) {
  return collectConfig(options.entryPoint).then(function (config) {
    writeStartup(config, options)
    patches()
    return compile(config)
  })
}
