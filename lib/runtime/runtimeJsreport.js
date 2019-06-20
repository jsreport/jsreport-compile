'use strict'

const path = require('path')
// const Execution = require('./execution')
const mkdirp = require('mkdirp')

module.exports = (options) => {
  const coreOptions = {
    // we load config but don't do extensions discover by default
    loadConfig: true,
    appDirectory: process.cwd(),
    parentModuleDirectory: process.cwd(),
    rootDirectory: process.cwd(),
    // templatingEngines: {
    //   strategy: 'in-process'
    // }
  }

  if (process.env.binary_tempDirectory) {
    coreOptions.tempDirectory = process.env.binary_tempDirectory
  }

  const jsreport = require('jsreport-core')(coreOptions)

  if (options.extendConfigFn != null) {
    jsreport.afterConfigLoaded(options.extendConfigFn)
  }

  // jsreport.execution = new Execution(
  //   options.resourcesId,
  //   options.resources,
  //   options.includes,
  //   options.version,
  //   options.shortid,
  //   coreOptions.tempDirectory
  // )

  jsreport.version = options.version

  // enhance init function and add resources initialization
  const originalInit = jsreport.init.bind(jsreport)

  jsreport.init = async () => {
    await jsreport.execution.createTempResources()

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
