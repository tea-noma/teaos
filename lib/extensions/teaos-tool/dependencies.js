const teaos = require('../../..');

teaos.declare({
  type: 'teaos-tool',
  name: 'dependencies',
  func: (argv) => {
    const recursive = argv.indexOf('-a') !== -1;
    console.log(teaos.dependencies(process.cwd(), { recursive }));
  }
});
