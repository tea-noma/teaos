const teaosTool = require('../../objects/teaos-tool');

teaosTool.declare({
  type: 'teaos-tool',
  name: 'ls',
  func: (_argv) => {
    const results = teaosTool.getPackages();
    console.log(results);
  }
});
