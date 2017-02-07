/* global jsreport resources */
var nexeres = require('nexeres')
jsreport.execution = {
  resource: function (name) {
    return nexeres.get(resources[name])
  }
}
