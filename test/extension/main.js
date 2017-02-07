var path = require('path')
module.exports = function (reporter, definition) {
  console.log('Initializing extension test')
  if (reporter.compilation) {
    reporter.compilation.resource('resource', path.join(__dirname, 'resource.json'))
  }

  if (reporter.execution) {
    console.log('resource value: ' + reporter.execution.resource('resource').toString())
  }
  console.log('Extension initialization end')
}
