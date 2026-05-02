const fs = require('fs');
const path = require('path');
const teaos = require('../../..');
const teaosTool = teaos.getTools();

function loadBuiltInTools(){
  const root = __dirname;
  let files = [];
  try {
    files = fs.readdirSync(root);
  } catch(err){
    return;
  }

  for(let i = 0; i < files.length; i++){
    const file = files[i];
    if(file === 'help.js'){
      continue;
    }
    if(path.extname(file) !== '.js'){
      continue;
    }
    require(path.join(root, file));
  }
}

function renderToolHelp(name, desc){
  const title = desc.title || name;
  const description = desc.description || '';
  console.log('teaos ' + name);
  console.log('  ' + title);
  if(description){
    console.log('  ' + description);
  }
}

function renderIndex(declarations){
  const names = Object.keys(declarations).sort();
  console.log('Usage:');
  console.log('  teaos help');
  console.log('  teaos help {name}');
  console.log('');
  console.log('Commands:');
  for(let i = 0; i < names.length; i++){
    const name = names[i];
    const desc = declarations[name];
    const title = desc.title || name;
    const description = desc.description ? ' - ' + desc.description : '';
    console.log('  ' + name + ': ' + title + description);
  }
}

teaos.declare({
  type: 'teaos-tool',
  name: 'help',
  title: 'Show CLI help for teaos tools',
  description: 'Display available teaos commands and detailed help for a command.',
  func: (argv) => {
    loadBuiltInTools();
    const declarations = teaosTool.getDeclarations();
    const commandName = argv[3];
    if(commandName && declarations[commandName]){
      renderToolHelp(commandName, declarations[commandName]);
      return;
    }
    renderIndex(declarations);
  }
});
