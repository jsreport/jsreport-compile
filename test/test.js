var path = require('path')
var compile = require('../lib/compile')
var Promise = require('bluebird')
var fs = Promise.promisifyAll(require('fs'))
var spawnSync = require('child_process').spawnSync
require('should')

describe('compilation', function () {
  beforeEach(function () {
    return fs.unlinkAsync(path.join(__dirname, '../jsreport.exe')).catch(function (e) {
    })
  })

  it('foo', function () {
    return compile({
      entryPoint: path.join(__dirname, 'entry.js')
    }).delay(5000).then(function () {
      var result = spawnSync(path.join(__dirname, '../jsreport.exe'), {
        cwd: path.join(__dirname, '../')
      })

      result.output.toString().should.containEql('reporter initialized')
    })
  })
})

