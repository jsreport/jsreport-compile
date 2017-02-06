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

jsreport.init().then(function () {
  console.log('runnig')
}).catch(function (e) {
  console.error(e)
})

