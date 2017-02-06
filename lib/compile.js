
var path = require('path')
var Promise = require('bluebird')
var nexe = require('nexe')
var fs = Promise.promisifyAll(require('fs'))
var nexeCompile = Promise.promisify(nexe.compile)

function collectConfig (entryPoint) {
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

  var reporter = require(entryPoint)

  reporter.compilation = {
    exclude: function () {
      compileConfig.browserifyExcludes = compileConfig.browserifyExcludes.concat(arguments)
    },
    include: function () {

    },
    resource: function () {

    }
  }

  // reporter.options.express.enabled = false

  return reporter.init().then(function () {
    return compileConfig
  })
}

function writeStartup () {
  return fs.readFileAsync(path.join(__dirname, './startupTemplate.js')).then(function (content) {
    return fs.writeFileAsync(path.join(__dirname, '../startup.js'), content)
  })
}

module.exports = function (options) {
  return collectConfig(options.entryPoint).then(function (compileOptions) {
    return writeStartup().then(function () {
      return nexeCompile(compileOptions)
    })
  })
}
