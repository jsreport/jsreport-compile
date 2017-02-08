
var includes = {"engineScript":"./node_modules/jsreport-core/lib/render/engineScript.js","noneEngine":"./node_modules/jsreport-core/lib/render/noneEngine.js","testEngine":"./test/extension/engine.js"}

var resources = {"resource":{"path":"test\\extension\\resource.json"},"phantomjs.exe":{"path":"node_modules\\phantomjs\\lib\\phantom\\phantomjs.exe","temp":true},"standaloneScript.js":{"path":"node_modules\\phantom-html-to-pdf\\lib\\scripts\\standaloneScript.js","temp":true},"favicon.ico":{"path":"node_modules\\jsreport-studio\\static\\favicon.ico","temp":true},"1.client.js":{"path":"node_modules\\jsreport-studio\\static\\dist\\1.client.js","temp":true},"404a525502f8e5ba7e93b9f02d9e83a9.eot":{"path":"node_modules\\jsreport-studio\\static\\dist\\404a525502f8e5ba7e93b9f02d9e83a9.eot","temp":true},"891e3f340c1126b4c7c142e5f6e86816.woff":{"path":"node_modules\\jsreport-studio\\static\\dist\\891e3f340c1126b4c7c142e5f6e86816.woff","temp":true},"926c93d201fe51c8f351e858468980c3.woff2":{"path":"node_modules\\jsreport-studio\\static\\dist\\926c93d201fe51c8f351e858468980c3.woff2","temp":true},"bae4a87c1e5dff40baa3f49d52f5347a.svg":{"path":"node_modules\\jsreport-studio\\static\\dist\\bae4a87c1e5dff40baa3f49d52f5347a.svg","temp":true},"client.js":{"path":"node_modules\\jsreport-studio\\static\\dist\\client.js","temp":true},"fb650aaf10736ffb9c4173079616bf01.ttf":{"path":"node_modules\\jsreport-studio\\static\\dist\\fb650aaf10736ffb9c4173079616bf01.ttf","temp":true},"index.html":{"path":"node_modules\\jsreport-studio\\static\\dist\\index.html","temp":true},"templates":{"path":"node_modules\\jsreport-templates\\studio\\main.js"},"data":{"path":"node_modules\\jsreport-data\\studio\\main.js"},"phantom-pdf":{"path":"node_modules\\jsreport-phantom-pdf\\studio\\main.js"},"xlsx":{"path":"node_modules\\jsreport-xlsx\\studio\\main.js"}}
var nexeres = require('nexeres')
var fs = require('fs')
var tmpdir = require('os').tmpdir()
var path = require('path')
var Promise = require('bluebird')
var writeFileAsync = Promise.promisify(fs.writeFile)

process.env.DEBUG = 'jsreport'
console.log(JSON.stringify(process.argv))

var jsreport = require('jsreport-core')({
  loadConfig: false,
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


var resources = {"resource":{"path":"test\\extension\\resource.json"},"phantomjs.exe":{"path":"node_modules\\phantomjs\\lib\\phantom\\phantomjs.exe","temp":true},"standaloneScript.js":{"path":"node_modules\\phantom-html-to-pdf\\lib\\scripts\\standaloneScript.js","temp":true},"favicon.ico":{"path":"node_modules\\jsreport-studio\\static\\favicon.ico","temp":true},"1.client.js":{"path":"node_modules\\jsreport-studio\\static\\dist\\1.client.js","temp":true},"404a525502f8e5ba7e93b9f02d9e83a9.eot":{"path":"node_modules\\jsreport-studio\\static\\dist\\404a525502f8e5ba7e93b9f02d9e83a9.eot","temp":true},"891e3f340c1126b4c7c142e5f6e86816.woff":{"path":"node_modules\\jsreport-studio\\static\\dist\\891e3f340c1126b4c7c142e5f6e86816.woff","temp":true},"926c93d201fe51c8f351e858468980c3.woff2":{"path":"node_modules\\jsreport-studio\\static\\dist\\926c93d201fe51c8f351e858468980c3.woff2","temp":true},"bae4a87c1e5dff40baa3f49d52f5347a.svg":{"path":"node_modules\\jsreport-studio\\static\\dist\\bae4a87c1e5dff40baa3f49d52f5347a.svg","temp":true},"client.js":{"path":"node_modules\\jsreport-studio\\static\\dist\\client.js","temp":true},"fb650aaf10736ffb9c4173079616bf01.ttf":{"path":"node_modules\\jsreport-studio\\static\\dist\\fb650aaf10736ffb9c4173079616bf01.ttf","temp":true},"index.html":{"path":"node_modules\\jsreport-studio\\static\\dist\\index.html","temp":true},"templates":{"path":"node_modules\\jsreport-templates\\studio\\main.js"},"data":{"path":"node_modules\\jsreport-data\\studio\\main.js"},"phantom-pdf":{"path":"node_modules\\jsreport-phantom-pdf\\studio\\main.js"},"xlsx":{"path":"node_modules\\jsreport-xlsx\\studio\\main.js"}}

var includes = {"engineScript":"./node_modules/jsreport-core/lib/render/engineScript.js","noneEngine":"./node_modules/jsreport-core/lib/render/noneEngine.js","testEngine":"./test/extension/engine.js"}


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
  jsreport.use(require('./node_modules/jsreport-express')())
jsreport.use(require('./node_modules/jsreport-templates')())
jsreport.use(require('./test/extension')())
jsreport.use(require('./node_modules/jsreport-data')())
jsreport.use(require('./node_modules/jsreport-phantom-pdf')())
jsreport.use(require('./node_modules/jsreport-studio')())
jsreport.use(require('./node_modules/jsreport-xlsx')())
}).then(function () {
  jsreport.init().then(function () {
    require('./test/afterInitScript.js')(jsreport)
  }).catch(function (e) {
    console.error(e)
  })
})
