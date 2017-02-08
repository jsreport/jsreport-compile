module.exports = function (jsreport) {
  jsreport.render({
    template: {
      content: 'foo',
      engine: 'test',
      recipe: 'html'
    }
  }).then(function (res) {
    console.log(res.content.toString())
  }).catch(function (e) {
    console.error(e)
  })
}
