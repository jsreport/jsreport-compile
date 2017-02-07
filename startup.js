
var resources = {"resource":"test\\extension\\resource.json"}
process.env.DEBUG = 'jsreport'

var jsreport = require('jsreport-core')({
  loadConfig: false,
  appDirectory: process.cwd(),
  parentModuleDirectory: process.cwd(),
  rootDirectory: process.cwd(),
  tasks: {
    strategy: 'in-process'
  }
})


/* global jsreport resources */
var nexeres = require('nexeres')
jsreport.execution = {
  resource: function (name) {
    return nexeres.get(resources[name])
  }
}

jsreport.use(require('./test/extension')())
jsreport.use(require('./node_modules/jsreport-templates')())
jsreport.use(require('./node_modules/jsreport-data')())

jsreport.init().then(function () {
  console.log('runnig')
}).catch(function (e) {
  console.error(e)
})

