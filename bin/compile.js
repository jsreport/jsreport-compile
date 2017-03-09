#!/usr/bin/env node
var defaultOutput = 'jsreport'

if (process.platform === 'win32') {
  defaultOutput = 'jsreport.exe'
}

var argv = require('yargs')
    .usage('Usage: $0 -i [server.js] -o [jsreport.exe]')
    .options('i', {
      demand: true,
      alias: 'input',
      desc: 'Script bootstraping jsreport.',
      default: 'server.js'
    }).options('o', {
      alias: 'output',
      desc: 'The output binary or bundle file',
      default: defaultOutput
    }).options('b', {
      alias: 'bundle',
      default: false,
      desc: 'Only bundle entry into single js file which can be used for quicker testing'
    })
    .help()
    .example('$0')
    .example('$0 -i startup.js -o ' + defaultOutput)
    .example('$0 -b -i startup.js -o jsreport.js')
    .example('$0 -b')
    .argv

if (argv.bundle && argv.output === defaultOutput) {
  argv.output = 'jsreport.js'
}

require('../')(argv).finally(function () {
  process.exit()
})
