var path = require('path')
module.exports = function (reporter, definition) {
  console.log('Initializing extension test')

  reporter.extensionsManager.engines.push({
    name: 'test',
    pathToEngine: reporter.execution ? reporter.execution.resolve('testEngine') : require('path').join(__dirname, 'engine.js')
  })

  if (reporter.compilation) {
    reporter.compilation.resource('resource', path.join(__dirname, 'resource.json'))
    reporter.compilation.include('testEngine', require('path').join(__dirname, 'engine.js'))
  }

  if (reporter.execution) {
    console.log('resource value: ' + reporter.execution.resource('resource').toString())
  }
  console.log('Extension initialization end')
}
