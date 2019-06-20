// Dynamicaly constructed main entry for the jsreport executable
'use strict'

const runtime = $runtime

module.exports = runtime({
  version: '$version',
  resources: $resources,
  includes: $includes,
  extendConfigFn: $extendConfigFn,
  requireExtensions: $requireExtensions,
  requireCliExtensionsCommands: $requireCliExtensionsCommands,
  shortid: '$shortid',
  handleArguments: $handleArguments
})
