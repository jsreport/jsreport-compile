var jsreportInstance = require('jsreport-core')({
  discover: true
})

if (require.main !== module) {
  module.exports = jsreportInstance
} else {
  jsreportInstance.init().then(function () {
    console.log('jsreport started')
  })
}
