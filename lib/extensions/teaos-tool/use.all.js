const teaos = require('../../..');
const teaosTool = teaos.getTools();

teaos.declare({
  type: 'teaos-tool',
  name: 'use.all',
  title: 'Use all local libs',
  description: 'Use every local lib package with all resources and show trace report.',
  func: (_argv) => {
    const teaos = teaosTool.getTeaos();
    const results = teaosTool.getPackages();
    for(let i = 0; i < results.length; i++){
      teaos.use('@' + results[i], { resources: '*' });
    }
    teaosTool.logReport();
  }
});
