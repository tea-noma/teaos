const teaos = require('../../..');
const teaosTool = teaos.getTools();

teaos.declare({
  type: 'teaos-tool',
  name: 'require.all',
  func: (_argv) => {
    const teaos = teaosTool.getTeaos();
    const results = teaosTool.getPackages();
    for(let i = 0; i < results.length; i++){
      teaos.require('@' + results[i]);
    }
    teaosTool.logReport();
  }
});
