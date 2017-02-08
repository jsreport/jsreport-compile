module.exports = function (jsreport) {
  console.log('running afterInitScript')
  if (process.argv[2] === 'run') {
    require(process.argv[3])(jsreport)
  }
}
