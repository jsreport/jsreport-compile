'use strict'

const path = require('path')
const assign = require('object-assign')
const omit = require('lodash.omit')
const Execution = require('./execution')
const mkdirp = require('mkdirp')

function optionsContainsTransports (_options) {
  var options = _options || {}

  return Object.keys(options).some(function (optName) {
    var opt = options[optName]

    return (
      opt &&
      typeof opt === 'object' &&
      !Array.isArray(opt)
    )
  })
}

module.exports = function (options) {
  const jsreport = require('jsreport-core')({
    // we load config but don't do extensions discover by default
    loadConfig: true,
    appDirectory: process.cwd(),
    parentModuleDirectory: process.cwd(),
    rootDirectory: process.cwd(),
    templatingEngines: {
      // only in process strategy is currently supported
      strategy: 'in-process'
    }
  })

  jsreport.afterConfigLoaded(function (reporter) {
    // this condition prevents adding the same transports again.
    // usually this only happens when testing where there is a
    // lot of jsreport instances created
    if (
      reporter.logger.transports.console ||
      reporter.logger.transports.file ||
      reporter.logger.transports.error
    ) {
      return
    }

    const defaultLevel = reporter.options.mode === 'production' ? 'info' : 'debug'

    reporter.options.logger.console = Object.assign({
      transport: 'console',
      level: defaultLevel,
      timestamp: true,
      colorize: true
    }, reporter.options.logger.console)

    reporter.options.logger.file = Object.assign({
      transport: 'file',
      level: defaultLevel,
      filename: 'logs/reporter.log',
      maxsize: 10485760,
      json: false
    }, reporter.options.logger.file)

    reporter.options.logger.error = Object.assign({
      transport: 'file',
      level: 'error',
      filename: 'logs/error.log',
      handleExceptions: true,
      json: false
    }, reporter.options.logger.error)

    // winston doesn't create the directories for logs automatically
    // we don't want to do it for developers as well, but also we want to make jsreport with default config running
    // without errors, so we break the consistency here and precreate the logs directory if the config equals to default
    if (reporter.options.logger.file.filename === 'logs/reporter.log') {
      mkdirp.sync(path.dirname(reporter.options.logger.file.filename))
    }
  })

  jsreport.execution = new Execution(options.resourcesId, options.resources, options.includes, options.version, options.shortid)
  jsreport.version = options.version
  jsreport.options.templatingEngines.engineScriptPath = jsreport.execution.resolve('engineScript')
  jsreport.options.templatingEngines.safeSandboxPath = jsreport.execution.resolve('safeSandbox')

  // enhance init function and add resources initialization
  const originalInit = jsreport.init.bind(jsreport)

  jsreport.init = function () {
    return jsreport.execution.createTempResources().then(function () {
      // now we have resources availible, we can use extensions
      options.requireExtensions().forEach((e) => {
        jsreport.use(e())
      })

      return originalInit().then(function () {
        // overwrite absolute paths to engines with paths working inside bundle
        jsreport.extensionsManager.engines.forEach(function (e) {
          e.pathToEngine = jsreport.execution.resolve(e.name)
        })

        jsreport.options.templatingEngines.modules.forEach(function (e) {
          e.path = jsreport.execution.resolve(e.alias)
        })

        return jsreport
      })
    })
  }

  return jsreport
}
