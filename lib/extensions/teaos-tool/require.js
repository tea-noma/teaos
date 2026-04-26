const teaos = require('../../../index');
const teaosTool = require('../../objects/teaos-tool');

teaos.declare({
  type: 'teaos-tool',
  name: 'require',
  func: (argv) => {
    teaos.require('@' + argv[3]);
    teaosTool.logReport();
  }
});
