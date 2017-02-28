'use strict'

const Execution = require('./execution')
const winston = require('winston')

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

  jsreport.logger.add(winston.transports.Console, {
    timestamp: true,
    colorize: true
  })

  jsreport.execution = new Execution(options.resources, options.includes, jsreport.version, options.shortid)
  jsreport.options.engineScriptPath = jsreport.options.tasks.engineScriptPath = jsreport.execution.resolve('engineScript')

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
        instance: jsreport,
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
