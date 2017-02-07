
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
    resources: {}
  }

  reporter.compilation = {
    exclude: function () {
      // compileConfig.browserifyExcludes = compileConfig.browserifyExcludes.concat(arguments)
    },
    include: function () {

    },
    resource: function (name, p) {
      config.resources[name] = path.relative(path.join(__dirname, '../'), p)
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

function writeStartup (config) {
  var setup = os.EOL + fs.readFileSync(path.join(__dirname, 'reporterSetup.js')) + os.EOL
  setup += config.extensions.map(function (e) {
    return 'jsreport.use(require(\'./' + path.relative(path.join(__dirname, '../'), e.directory).replace(/\\/g, '/') + '\')())'
  }).join(os.EOL)

  var resources = os.EOL + 'var resources = ' + JSON.stringify(config.resources) + os.EOL

  var content = fs.readFileSync(path.join(__dirname, './startupTemplate.js'))
  fs.writeFileSync(path.join(__dirname, '../startup.js'), resources + content.toString().replace('$extensions', setup))
}

function compile (config) {
  var compileConfig = {
    output: 'jsreport.exe',
    input: 'startup.js',
    framework: 'nodejs',
    nodeVersion: '7.4.0',
    nodeTempDir: 'build',
    browserifyExcludes: [],
    browserifyRequires: [],
    resourceFiles: []
  }

  Object.keys(config.resources).forEach(function (k) {
    compileConfig.resourceFiles.push(config.resources[k])
  })

  return nexeCompile(compileConfig)
}

module.exports = function (options) {
  return collectConfig(options.entryPoint).then(function (config) {
    writeStartup(config)
    patches()
    return compile(config)
  })
}
