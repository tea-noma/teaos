const teaos = require('../../../index');
const teaosTool = require('../../objects/teaos-tool');

teaos.declare({
  type: 'teaos-tool',
  name: 'require.all',
  func: (_argv) => {
    const results = teaosTool.getPackages();
    for(let i = 0; i < results.length; i++){
      teaos.require('@' + results[i]);
    }
    teaosTool.logReport();
  }
});
