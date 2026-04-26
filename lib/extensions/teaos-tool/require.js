const teaosTool = require('../../objects/teaos-tool');

teaosTool.declare({
  type: 'teaos-tool',
  name: 'require',
  func: (argv) => {
    teaosTool.getTeaos().require('@' + argv[3]);
    teaosTool.logReport();
  }
});
