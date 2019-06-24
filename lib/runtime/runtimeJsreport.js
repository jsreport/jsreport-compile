'use strict'

const Execution = require('./execution')

module.exports = (options) => {
  const coreOptions = {
    // we load config but don't do extensions discover by default
    loadConfig: true,
    appDirectory: process.cwd(),
    parentModuleDirectory: process.cwd(),
    rootDirectory: process.cwd()
  }

  if (process.env.binary_tempDirectory) {
    coreOptions.tempDirectory = process.env.binary_tempDirectory
  }

  const jsreport = options.getJsreport()

  jsreport.defaults = Object.assign(jsreport.defaults, {
    // we put it as defaults to be able to override with config later
    discover: false
  })

  jsreport.options = Object.assign(jsreport.options, coreOptions)

  jsreport.execution2 = new Execution(
    options.originalProjectDir,
    options.resources,
    options.version,
    options.shortid,
    coreOptions.tempDirectory
  )

  // enhance init function and add resources initialization
  const originalInit = jsreport.init.bind(jsreport)

  jsreport.init = async function exeJsreportInit () {
    await jsreport.execution2.createTempResources()

    // now we have resources available, we can use extensions
    options.requireExtensions().forEach((extInit) => {
      const ext = extInit()
      ext.source = extInit.source
      ext.version = extInit.version
      ext.cliModule = extInit.cliModule
      jsreport.use(ext)
    })

    await originalInit()

    return jsreport
  }

  return jsreport
}
