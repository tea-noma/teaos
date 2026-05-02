const teaos = require('../../..');
const teaosTool = teaos.getTools();

teaos.declare({
  type: 'teaos-tool',
  name: 'require',
  title: 'Require local lib',
  description: 'Require one local lib package and show trace report.',
  func: (argv) => {
    teaosTool.getTeaos().require('@' + argv[3]);
    teaosTool.logReport();
  }
});
