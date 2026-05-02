const teaos = require('../../..');

teaos.declare({
  type: 'teaos-tool',
  name: 'attr',
  title: 'Get teaos attribute',
  description: 'Print a teaos project attribute value by key.',
  func: (argv) => {
    const name = argv[3];
    if(!name){
      return;
    }
    const value = teaos.attr(name);
    if(value !== null){
      console.log(value);
    }
  }
});
