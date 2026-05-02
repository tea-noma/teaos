const fs = require('fs');
const path = require('path');
const teaos = require('../../..');

function listExtensionTypes(){
  const libRoot = path.resolve(process.cwd(), 'lib');
  const types = {};
  try {
    const packages = fs.readdirSync(libRoot);
    for(let i = 0; i < packages.length; i++){
      const extRoot = path.join(libRoot, packages[i], 'lib/extensions');
      try {
        const entries = fs.readdirSync(extRoot);
        for(let j = 0; j < entries.length; j++){
          const full = path.join(extRoot, entries[j]);
          try {
            if(fs.statSync(full).isDirectory()){
              types[entries[j]] = true;
            }
          } catch(err){
          }
        }
      } catch(err){
      }
    }
  } catch(err){
  }
  return Object.keys(types).sort();
}

teaos.declare({
  type: 'teaos-tool',
  name: 'extension-types',
  title: 'List extension types',
  description: 'List discovered extension types under local lib packages.',
  func: (_argv) => {
    console.log(listExtensionTypes());
  }
});
