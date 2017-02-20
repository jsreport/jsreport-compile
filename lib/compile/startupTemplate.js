// Dynamicaly constructed main entry for the bundled jsreport executable
// This is supposed to require whole modules tree which is then bundled using browserify
'use strict'

const runtime = $runtime

module.exports = runtime({
  resources: $resources,
  includes: $includes,
  requireExtensions: $requireExtensions,
  shortid: '$shortid',
  handleArguments: $handleArguments
})
