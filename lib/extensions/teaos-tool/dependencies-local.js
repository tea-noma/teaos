const teaos = require('../../..');

teaos.declare({
  type: 'teaos-tool',
  name: 'dependencies-local',
  func: (argv) => {
    const recursive = argv.indexOf('-a') !== -1;
    console.log(teaos.localDependencies(process.cwd(), { recursive }));
  }
});
