process.env.DEBUG = 'jsreport'
var debug = require('debug')('jsreport')
debug('starting')
var fs = require('fs')
var nexeres = require('nexeres')
var tmpdir = require('os').tmpdir()
var path = require('path')
var Promise = require('bluebird')
fs = Promise.promisifyAll(fs)

debug('requiring jsreport')

$setup

var jsreport = require('jsreport-core')({
  loadConfig: true,
  appDirectory: process.cwd(),
  parentModuleDirectory: process.cwd(),
  rootDirectory: process.cwd(),
  // until released in jsreport-core
  engineScriptPath: includes['engineScript'],
  tasks: {
    strategy: 'in-process',
    engineScriptPath: includes['engineScript']
  }
})

var tmpPath = path.join(tmpdir, 'jsreport-' + jsreport.version + '-$shortid')

if (!fs.existsSync(tmpPath)) {
  fs.mkdirSync(tmpPath)
}

jsreport.execution = {
  includes: includes,
  resource: function (name) {
    if (!resources[name]) {
      return null
    }

    return nexeres[resources[name].path]
  },
  tempDirectory: tmpPath,
  resourceTempPath: function (name) {
    return path.join(tmpPath, name)
  },
  resolve: function (name) {
    return includes[name]
  }
}

debug('writing resources')

module.exports = Promise.all(Object.keys(resources).filter(function (r) {
  return resources[r].temp
}).map(function (r) {
  return fs.statAsync(path.join(tmpPath, r)).catch(function () {
    return fs.writeFileAsync(path.join(tmpPath, r), nexeres[resources[r].path]).then(function () {
      delete nexeres[resources[r].path]
      return fs.chmodAsync(path.join(tmpPath, r), 777)
    })
  })
})).then(function () {
  $extensions
}).then(function () {
  debug('initializing jsreport')
  return jsreport.init().then(function () {
    jsreport.extensionsManager.engines.forEach(function (e) {
      e.pathToEngine = jsreport.execution.resolve(e.name)
    })

    jsreport.options.tasks.modules.forEach(function (e) {
      e.path = jsreport.execution.resolve(e.alias)
    })

    debug('running')

    $afterInitScript

    return jsreport
  }).catch(function (e) {
    console.error(e)
  })
})
