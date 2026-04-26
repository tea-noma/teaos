const teaos = require('../../..');
const teaosTool = teaos.getTools();

teaos.declare({
  type: 'teaos-tool',
  name: 'use',
  func: (argv) => {
    teaosTool.getTeaos().use('@' + argv[3], { resources: '*' });
    teaosTool.logReport();
  }
});
