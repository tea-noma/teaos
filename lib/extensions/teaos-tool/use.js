const teaos = require('../../../index');
const teaosTool = require('../../objects/teaos-tool');

teaos.declare({
  type: 'teaos-tool',
  name: 'use',
  func: (argv) => {
    teaos.use('@' + argv[3], { resources: '*' });
    teaosTool.logReport();
  }
});
