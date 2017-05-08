'use strict'

const Execution = require('./execution')

module.exports = function (options) {
  const execution = new Execution(options.resourcesId, options.resources, options.includes, options.version, options.shortid)
  const getJsreport = prepareJsreport(options.jsreportRuntimeId)

  if (options.handleArguments === false) {
    return getJsreport()
  }

  if (process.argv.length === 5 && process.argv[4] === '--node-process') {
    // the process is started from keep-alive spawn
    // we just pass control to cli daemon script
    require(process.argv[2])(getJsreport, process.argv[3])
  } else {
    // let the cli to init jsreport and handle the handle arguments
    // we only need to make sure WinRun.exe resource is existing because it is used before jsreport.init is called
    execution.ensureTmpResources(['WinRun.exe', 'nssm.exe', 'nssm64.exe']).then(function () {
      require('jsreport-cli').commander(process.cwd(), {
        disabledCommands: ['init', 'repair'],
        instance: getJsreport,
        appInfo: {
          path: process.cwd(),
          name: 'jsreport-server-exe',
          description: 'javascript based reporting platform',
          startcmd: process.execPath + ' start'
        },
        staticPaths: {
          nssm: process.arch === 'x64' ? execution.resourceTempPath('nssm64.exe') : execution.resourceTempPath('nssm.exe')
        },
        // we cli to spawn another jsreport.exe when rendering with keep-alive
        daemonExecPath: process.execPath,
        // resolve bundle path to additionaly included script
        daemonExecScriptPath: execution.resolve('daemonInstance'),
        // ask cli to add extra argument to the process so we can distinguisg between full and daemon run
        daemonExecArgs: ['--node-process'],
        // resolve already persisted WinRun.exe path from temp
        daemonExecOpts: { WinRunPath: execution.resourceTempPath('WinRun.exe') }
      }).start(process.argv.slice(2))
    })
  }
}

function prepareJsreport (jsreportRuntimeId) {
  // we return a function to lazily create a jsreport instance when needed
  return function () {
    return require(jsreportRuntimeId)
  }
}
