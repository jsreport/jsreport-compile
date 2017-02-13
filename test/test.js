var path = require('path')
var compile = require('../lib/compile')
var Promise = require('bluebird')
var fs = Promise.promisifyAll(require('fs'))

require('should')

describe('compilation', function () {
  var jsreport

  before(function () {
    return fs.unlinkAsync(path.join(__dirname, 'bundle.js')).catch(function (e) {}).then(function () {
      return compile({
        input: 'test/entry.js',
        output: 'test/bundle.js',
        bundle: true
      })
    }).then(function () { 
      return require('./bundle.js').then(function (instance) {
        console.log('grapping instance from bundle')
        jsreport = instance
      })
    })
  })

  it('should initialize jsreport isntance', function () {
    jsreport.render.should.be.ok()
  })

  it('should discover and include engines', function () {
    return jsreport.render({
      template: {
        content: 'foo',
        engine: 'test',
        recipe: 'html'
      }
    }).then(function (res) {
      res.content.toString().should.be.eql('test:foo')
    })
  })

  it('should compile and get resources', function () {
    jsreport.test.resource.toString().should.be.eql('foo')
  })

  it('should include and resolve specified modules', function () {
    jsreport.test.include.should.be.eql('external')
  })
})

