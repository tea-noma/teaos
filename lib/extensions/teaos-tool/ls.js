const teaos = require('../../../index');
const teaosTool = require('../../objects/teaos-tool');

teaos.declare({
  type: 'teaos-tool',
  name: 'ls',
  func: (_argv) => {
    const results = teaosTool.getPackages();
    console.log(results);
  }
});
