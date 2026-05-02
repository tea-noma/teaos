const teaos = require('../../..');
const teaosTool = teaos.getTools();

teaos.declare({
  type: 'teaos-tool',
  name: 'use',
  title: 'Use local lib',
  description: 'Use one local lib package with all resources and show trace report.',
  func: (argv) => {
    teaosTool.getTeaos().use('@' + argv[3], { resources: '*' });
    teaosTool.logReport();
  }
});
