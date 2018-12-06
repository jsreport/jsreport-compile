process.env.jsreportTest = true
var path = require('path')
var compile = require('../')
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
        bundle: true,
        handleArguments: false
      })
    }).then(function () {
      return require('./bundle.js').init().then(function (instance) {
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

  it('should compile and get resource directory in temp', function () {
    return fs.readFileAsync(path.join(jsreport.test.resourceFolder, 'innerFolder', 'deep.txt'))
      .then((content) => content.toString().should.be.eql('foo'))
  })
})
