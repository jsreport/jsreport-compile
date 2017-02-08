module.exports = function (jsreport) {
  jsreport.render({
    template: {
      content: 'hello from none engine',
      engine: 'none',
      recipe: 'html'
    }
  }).then(function (res) {
    console.log(res.content.toString())
  }).catch(function (e) {
    console.error(e)
  })
}
