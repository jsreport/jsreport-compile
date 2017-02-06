var jsreportInstance = require('jsreport-core')()

if (require.main !== module) {
  module.exports = jsreportInstance
} else {
  jsreportInstance.init().then(function () {
    console.log('jsreport started')
  })
}
