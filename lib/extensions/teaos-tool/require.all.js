const teaos = require('../../..');
const teaosTool = teaos.getTools();

teaos.declare({
  type: 'teaos-tool',
  name: 'require.all',
  title: 'Require all local libs',
  description: 'Require every local lib package and show trace report.',
  func: (_argv) => {
    const teaos = teaosTool.getTeaos();
    const results = teaosTool.getPackages();
    for(let i = 0; i < results.length; i++){
      teaos.require('@' + results[i]);
    }
    teaosTool.logReport();
  }
});
