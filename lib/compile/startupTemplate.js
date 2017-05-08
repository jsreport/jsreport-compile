// Dynamicaly constructed main entry for the bundled jsreport executable
// This is supposed to require whole modules tree which is then bundled using browserify
'use strict'

const runtime = $runtime

module.exports = runtime({
  version: '$version',
  resources: $resources,
  includes: $includes,
  requireExtensions: $requireExtensions,
  shortid: '$shortid',
  resourcesId: '$resourcesId',
  jsreportRuntimeId: '$jsreportRuntimeId',
  handleArguments: $handleArguments
})
