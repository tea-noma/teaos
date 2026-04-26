const teaos = require('../../..');
const teaosTool = teaos.getTools();

teaos.declare({
  type: 'teaos-tool',
  name: 'require',
  func: (argv) => {
    teaosTool.getTeaos().require('@' + argv[3]);
    teaosTool.logReport();
  }
});
