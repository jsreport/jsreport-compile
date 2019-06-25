'use strict'

const path = require('path')

module.exports = (options) => {
  const customTempDirectory = getCustomTempDirectory()

  if (customTempDirectory) {
    process.env.cli_tempDirectory = customTempDirectory
    process.env.binary_tempDirectory = customTempDirectory
  }

  const getJsreport = prepareJsreport(options)

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
    const cli = require('jsreport-cli').commander(process.cwd(), {
      disabledCommands: ['init', 'repair'],
      jsreportVersion: options.version,
      instance: getJsreport,
      appInfo: {
        path: process.cwd(),
        name: 'jsreport-server-exe',
        description: 'javascript based reporting platform',
        startcmd: process.execPath + ' start'
      },
      // staticPaths: {
      //   nssm: process.arch === 'x64' ? execution.resourceTempPath('nssm64.exe') : execution.resourceTempPath('nssm.exe')
      // },
      // we cli to spawn another jsreport.exe when rendering with keep-alive
      daemonExecPath: process.execPath,
      // resolve bundle path to additionaly included script
      // daemonExecScriptPath: execution.resolve('daemonInstance'),
      // ask cli to add extra argument to the process so we can distinguisg between full and daemon run
      daemonExecArgs: (args) => {
        const newArgs = [...args]

        newArgs.unshift(process.pkg.defaultEntrypoint)
        newArgs.push('--node-process')

        return newArgs
      },
      // resolve already persisted WinRun.exe path from temp
      // daemonExecOpts: { WinRunPath: execution.resourceTempPath('WinRun.exe') }
    })

    if (options.requireCliExtensionsCommands) {
      const extensionCommands = options.requireCliExtensionsCommands()

      extensionCommands.forEach((extCmdModule) => {
        if (Array.isArray(extCmdModule)) {
          extCmdModule.forEach((cmdModule) => cli.registerCommand(cmdModule))
        } else {
          cli.registerCommand(extCmdModule)
        }
      })
    }

    cli.start(process.argv.slice(2))
  }
}

function prepareJsreport (options) {
  // we return a function to lazily create a jsreport instance when needed
  return function () {
    return require('../runtime/runtimeJsreport')(options)
  }
}

function getCustomTempDirectory () {
  const args = process.argv.slice(2)
  let directory

  if (process.env.tempDirectory) {
    directory = process.env.tempDirectory
  }

  args.some((a, idx) => {
    let fromArg = false

    if (a === '--tempDirectory' && args[idx + 1] != null) {
      fromArg = true
      directory = args[idx + 1]
    } else if (a.startsWith('--tempDirectory=')) {
      fromArg = true
      directory = a.slice(a.indexOf('=') + 1)
    }

    if (!fromArg) {
      return false
    }

    if (directory != null && directory.includes('"')) {
      if (directory.startsWith('"') && directory.endsWith('"')) {
        directory = directory.slice(1, -1)
      } else {
        directory = null
      }
    }

    if (directory !== '' && directory != null) {
      return true
    }

    return false
  })

  if (directory != null) {
    return path.resolve(process.cwd(), directory)
  }

  return null
}
