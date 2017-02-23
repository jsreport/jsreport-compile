var path = require('path')

module.exports = function (reporter, definition) {
  reporter.extensionsManager.engines.push({
    name: 'test',
    pathToEngine: require('path').join(__dirname, 'engine.js')
  })

  if (reporter.compilation) {
    reporter.compilation.resource('resource', path.join(__dirname, 'resource.txt'))
    reporter.compilation.include('external', path.join(__dirname, 'external.js'))
    reporter.compilation.resourceDirectoryInTemp('resourceFolder', path.join(__dirname, 'resourceFolder'))
  }

  if (reporter.execution) {
    reporter.test = {
      resource: reporter.execution.resource('resource'),
      include: require(reporter.execution.resolve('external')),
      resourceFolder: reporter.execution.resourceTempPath('resourceFolder')
    }
  }
}
