const teaosTool = require('../../objects/teaos-tool');

teaosTool.declare({
  type: 'teaos-tool',
  name: 'use.all',
  func: (_argv) => {
    const teaos = teaosTool.getTeaos();
    const results = teaosTool.getPackages();
    for(let i = 0; i < results.length; i++){
      teaos.use('@' + results[i], { resources: '*' });
    }
    teaosTool.logReport();
  }
});
