var path = require('path')
var compile = require('../lib/compile')
var Promise = require('bluebird')
var fs = Promise.promisifyAll(require('fs'))
var spawnSync = require('child_process').spawnSync
require('should')

describe('compilation', function () {
  before(function () {
    return fs.unlinkAsync(path.join(__dirname, '../jsreport.exe')).catch(function (e) {}).then(function () {
      return compile({
        entryPoint: path.join(__dirname, 'entry.js'),
        afterInitScript: './test/afterInitScript.js'
      }).delay(10000)
    })
  })

  it('should initialize jsreport', function () {
    var result = spawnSync(path.join(__dirname, '../jsreport.exe'), {
      cwd: path.join(__dirname, '../')
    })

    result.output.toString().should.containEql('reporter initialized')
    result.output.toString().should.containEql('resources work')
  })

  it('should render none enigne', function () {
    var result = spawnSync(path.join(__dirname, '../jsreport.exe'), ['run', './test/cases/renderNoneEngine.js'], {
      cwd: path.join(__dirname, '../')
    })

    result.output.toString().should.containEql('hello from none engine')
  })

  it('should render test enigne', function () {
    var result = spawnSync(path.join(__dirname, '../jsreport.exe'), ['run', './test/cases/renderTestEngine.js'], {
      cwd: path.join(__dirname, '../')
    })

    result.output.toString().should.containEql('testEngine')
  })
})

