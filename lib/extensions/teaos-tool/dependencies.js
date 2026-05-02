const teaos = require('../../..');

teaos.declare({
  type: 'teaos-tool',
  name: 'dependencies',
  title: 'List dependencies',
  description: 'Print tea and npm dependencies from the current project.',
  func: (argv) => {
    const recursive = argv.indexOf('-a') !== -1;
    console.log(teaos.dependencies(process.cwd(), { recursive }));
  }
});
