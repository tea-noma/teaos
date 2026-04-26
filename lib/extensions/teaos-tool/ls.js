const teaos = require('../../..');
const teaosTool = teaos.getTools();

teaos.declare({
  type: 'teaos-tool',
  name: 'ls',
  func: (_argv) => {
    const results = teaosTool.getPackages();
    console.log(results);
  }
});
