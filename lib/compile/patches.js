/* Collection of hard/monkey patches of several modules which are not compatible with browserify bundling
 * The changes are applied directly to files in curent node_modules, but should not be breaking
 * jsreport should run in normal way also afterwards
 *
 * Patched modules: chokidar, ws, engine.io, socket.io, nconf
 */

/* eslint no-template-curly-in-string: 0 */

var fs = require('fs')
var path = require('path')
var rimraf = require('rimraf').sync

function replaceInFile (pathToFile, toReplace, replacement) {
  var fullPath = path.join(process.cwd(), pathToFile)
  if (fs.existsSync(fullPath)) {
    fs.writeFileSync(fullPath, fs.readFileSync(fullPath).toString().replace(toReplace, replacement))
  }
}

module.exports = function () {
  replaceInFile('node_modules/chokidar/lib/fsevents-handler.js', 'fsevents = require(\'fsevents\');', 'throw new Error()')
  replaceInFile('node_modules/ws/lib/BufferUtil.js', 'const bufferUtil = require(\'bufferutil\')', 'throw new Error()')
  replaceInFile('node_modules/ws/lib/Validation.js', 'const isValidUTF8 = require(\'utf-8-validate\')', 'throw new Error()')
  replaceInFile('node_modules/natives/index.js', `require('v8').setFlagsFromString('--noallow_natives_syntax')`, ';')
  replaceInFile('node_modules/natives/index.js', `require('v8').setFlagsFromString('--allow_natives_syntax')`, ';')
  replaceInFile('node_modules/astw/index.js', `|| 8`, '|| 9')

  const sandboxContent = fs.readFileSync(path.join(process.cwd(), 'node_modules/vm2/lib/sandbox.js')).toString().replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
  replaceInFile('node_modules/vm2/lib/main.js', 'fs.readFileSync(`${__dirname}/sandbox.js`, \'utf8\')', '`' + sandboxContent + '`')

  const contextifyContent = fs.readFileSync(path.join(process.cwd(), 'node_modules/vm2/lib/contextify.js')).toString().replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
  replaceInFile('node_modules/vm2/lib/main.js', 'fs.readFileSync(`${__dirname}/contextify.js`, \'utf8\')', '`' + contextifyContent + '`')

  rimraf('node_modules/astw/node_modules')

  var socketioPath = path.join(process.cwd(), 'node_modules/socket.io-client/dist/socket.io.js')
  if (fs.existsSync(socketioPath)) {
    var socketioTweeks = "new Buffer('" + fs.readFileSync(socketioPath).toString('base64') + "', 'base64').toString('utf8')"
    replaceInFile('node_modules/socket.io/lib/index.js', `read(resolvePath( 'socket.io-client/dist/socket.io.js'), 'utf-8')`, socketioTweeks)
  }

  var nconfTweeks = `
  require('./nconf/stores/argv')
  nconf.__defineGetter__('Argv', function () { return require('./nconf/stores/argv')['Argv']})
  require('./nconf/stores/env')
  nconf.__defineGetter__('Env', function () { return require('./nconf/stores/env')['Env']})
  require('./nconf/stores/file')
  nconf.__defineGetter__('File', function () { return require('./nconf/stores/file')['File']})
  require('./nconf/stores/literal')
  nconf.__defineGetter__('Literal', function () { return require('./nconf/stores/literal')['Literal']})
  require('./nconf/stores/memory')
  nconf.__defineGetter__('Memory', function () { return require('./nconf/stores/memory')['Memory']})
  `

  var nconfOriginal = `['argv', 'env', 'file', 'literal', 'memory'].forEach(function (store) {
    var name = common.capitalize(store);

    nconf.__defineGetter__(name, function () {
        return require('./nconf/stores/' + store)[name];
    });
});`

  replaceInFile('node_modules/nconf/lib/nconf.js', nconfOriginal, nconfTweeks)
}
