const teaosTool = require('../../objects/teaos-tool');

teaosTool.declare({
  type: 'teaos-tool',
  name: 'use',
  func: (argv) => {
    teaosTool.getTeaos().use('@' + argv[3], { resources: '*' });
    teaosTool.logReport();
  }
});
