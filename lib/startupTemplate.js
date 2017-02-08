var nexeres = require('nexeres')
var fs = require('fs')
var tmpdir = require('os').tmpdir()
var path = require('path')
var Promise = require('bluebird')
var writeFileAsync = Promise.promisify(fs.writeFile)

process.env.DEBUG = 'jsreport'
console.log(JSON.stringify(process.argv))

var jsreport = require('jsreport-core')({
  loadConfig: true,
  appDirectory: process.cwd(),
  parentModuleDirectory: process.cwd(),
  rootDirectory: process.cwd(),
  tasks: {
    strategy: 'in-process'
  }
})

var tmpPath = path.join(tmpdir, 'jsreport-' + jsreport.version)

if (!fs.existsSync(tmpPath)) {
  fs.mkdirSync(tmpPath)
}

$setup

jsreport.execution = {
  resource: function (name) {
    if (!resources[name]) {
      return null
    }

    return nexeres.get(resources[name].path)
  },
  tempDirectory: tmpPath,
  resourceTempPath: function (name) {
    return path.join(tmpPath, name)
  },
  resolve: function (name) {
    return includes[name]
  }
}

console.log(JSON.stringify(resources))
Promise.all(Object.keys(resources).filter(function (r) {
  return resources[r].temp
}).map(function (r) {
  return writeFileAsync(path.join(tmpPath, r), nexeres.get(resources[r].path))
})).then(function () {
  $extensions
}).then(function () {
  jsreport.init().then(function () {
    $afterInitScript
  }).catch(function (e) {
    console.error(e)
  })
})
