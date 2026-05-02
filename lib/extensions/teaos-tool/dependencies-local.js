const teaos = require('../../..');

teaos.declare({
  type: 'teaos-tool',
  name: 'dependencies-local',
  title: 'List local dependencies',
  description: 'Print local tea dependencies from the current project.',
  func: (argv) => {
    const recursive = argv.indexOf('-a') !== -1;
    console.log(teaos.localDependencies(process.cwd(), { recursive }));
  }
});
