process.env.jsreportTest = true

var util = require('util')
var path = require('path')
var fs = require('fs')
var childProcess = require('child_process')
var compile = require('../')
var unlinkAsync = util.promisify(fs.unlink)
var readFileAsync = util.promisify(fs.readFile)

require('should')

async function jsreportExe (args) {
  const pathToExe = path.join(__dirname, 'exe')

  return new Promise((resolve, reject) => {
    childProcess.execFile(pathToExe, args, {
      cwd: __dirname
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        return reject(error)
      }

      resolve({
        stdout,
        stderr
      })
    })
  })
}

describe('compilation', function () {
  var jsreport

  before(function () {
    return unlinkAsync(path.join(__dirname, 'exe')).catch(function (e) {}).then(function () {
      return compile({
        nodeVersion: '10',
        input: 'test/entry.js',
        output: 'test/exe',
        handleArguments: false
      })
    })
  })

  it('should initialize jsreport instance', async function () {
    await jsreportExe()
  })

  it.skip('should discover and include engines', function () {
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

  it.skip('should compile and get resources', function () {
    jsreport.test.resource.toString().should.be.eql('foo')
  })

  it.skip('should include and resolve specified modules', function () {
    jsreport.test.include.should.be.eql('external')
  })

  it.skip('should compile and get resource directory in temp', function () {
    return readFileAsync(path.join(jsreport.test.resourceFolder, 'innerFolder', 'deep.txt'))
      .then((content) => content.toString().should.be.eql('foo'))
  })
})
