'use strict'

const path = require('path')
const fs = require('fs')
const assign = require('object-assign')
const mkdirp = require('mkdirp')
const Execution = require('./execution')

module.exports = function (options) {
  const jsreport = require('jsreport-core')({
    // we load config but don't do extensions discover by default
    loadConfig: true,
    appDirectory: process.cwd(),
    parentModuleDirectory: process.cwd(),
    rootDirectory: process.cwd(),
    tasks: {
      // only in process strategy is currently supported
      strategy: 'in-process'
    }
  })

  jsreport.afterConfigLoaded(function (reporter) {
    // configure logging
    var defaultOpts = {
      providerName: 'console',
      silent: false,
      logDirectory: path.join(reporter.options.rootDirectory, 'logs')
    }

    var defaultLevel
    var consoleTransport
    var mainTransport
    var errorTransport
    var logDirectory
    var transportSettings = {}

    if (reporter.options.logger && reporter.options.logger.providerName != null) {
      console.log(
        'Usage of deprecated option `logger.providerName` detected, ' +
        '`logger.providerName` is deprecated and will be removed in future versions, ' +
        'see the new format of "logger" options in https://jsreport.net/learn/configuration'
      )
    }

    reporter.options.logger = assign({}, defaultOpts, reporter.options.logger)

    logDirectory = reporter.options.logger.logDirectory

    // preserving original behavior, not applying any transport when
    // `reporter.options.logger.providerName` has an unknow value.
    if (
      reporter.options.logger &&
      reporter.options.logger.providerName !== 'winston' &&
      reporter.options.logger.providerName !== 'console'
    ) {
      return
    }

    defaultLevel = reporter.options.mode === 'production' ? 'info' : 'debug'

    consoleTransport = {
      transport: 'console',
      level: defaultLevel,
      timestamp: true,
      colorize: true
    }

    mainTransport = {
      transport: 'file',
      level: defaultLevel,
      filename: path.join(logDirectory, 'reporter.log'),
      maxsize: 10485760,
      json: false
    }

    errorTransport = {
      transport: 'file',
      level: 'error',
      filename: path.join(logDirectory, 'error.log'),
      handleExceptions: true,
      json: false
    }

    if (reporter.options.logger.providerName === 'winston') {
      transportSettings = {
        console: consoleTransport,
        main: mainTransport,
        error: errorTransport
      }
    } else if (reporter.options.logger.providerName === 'console') {
      transportSettings = {
        console: consoleTransport
      }
    }

    // applying user customizations to standard transports
    if (
      reporter.options.logger.console &&
      typeof reporter.options.logger.console === 'object' &&
      !Array.isArray(reporter.options.logger.console)
    ) {
      transportSettings.console = assign({}, transportSettings.console, reporter.options.logger.console)
    }

    if (
      reporter.options.logger.main &&
      typeof reporter.options.logger.main === 'object' &&
      !Array.isArray(reporter.options.logger.main)
    ) {
      transportSettings.main = assign({}, transportSettings.main, reporter.options.logger.main)
    }

    if (
      reporter.options.logger.error &&
      typeof reporter.options.logger.error === 'object' &&
      !Array.isArray(reporter.options.logger.error)
    ) {
      transportSettings.error = assign({}, transportSettings.error, reporter.options.logger.error)
    }

    if (transportSettings.main || transportSettings.error) {
      if (!fs.existsSync(logDirectory)) {
        mkdirp.sync(logDirectory)
      }
    }

    // applying transports
    reporter.options.logger = assign(reporter.options.logger, transportSettings)
  })

  jsreport.execution = new Execution(options.resources, options.includes, options.version, options.shortid)
  jsreport.version = options.version
  jsreport.options.tasks.engineScriptPath = jsreport.execution.resolve('engineScript')

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

        jsreport.options.tasks.modules.forEach(function (e) {
          e.path = jsreport.execution.resolve(e.alias)
        })

        return jsreport
      })
    })
  }

  if (options.handleArguments === false) {
    return jsreport
  }

  if (process.argv.length === 5 && process.argv[4] === '--node-process') {
    // the process is started from keep-alive spawn
    // we just pass control to cli daemon script
    require(process.argv[2])(jsreport, process.argv[3])
  } else {
    // let the cli to init jsreport and handle the handle arguments
    // we only need to make sure WinRun.exe resource is existing because it is used before jsreport.init is called
    jsreport.execution.ensureExeResources(['WinRun.exe', 'nssm.exe', 'nssm64.exe']).then(function () {
      require('jsreport-cli').commander(process.cwd(), {
        disabledCommands: ['init', 'repair'],
        instance: jsreport,
        appInfo: {
          path: process.cwd(),
          name: 'jsreport-server-exe',
          description: 'javascript based reporting platform',
          startcmd: process.execPath + ' start'
        },
        staticPaths: {
          nssm: process.arch === 'x64' ? jsreport.execution.resourceTempPath('nssm64.exe') : jsreport.execution.resourceTempPath('nssm.exe')
        },
        // we cli to spawn another jsreport.exe when rendering with keep-alive
        daemonExecPath: process.execPath,
        // resolve bundle path to additionaly included script
        daemonExecScriptPath: jsreport.execution.resolve('daemonInstance'),
        // ask cli to add extra argument to the process so we can distinguisg between full and daemon run
        daemonExecArgs: ['--node-process'],
        // resolve already persisted WinRun.exe path from temp
        daemonExecOpts: { WinRunPath: jsreport.execution.resourceTempPath('WinRun.exe') }
      }).start(process.argv.slice(2))
    })
  }

  return jsreport
}
