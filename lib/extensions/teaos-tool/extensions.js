const fs = require('fs');
const path = require('path');
const teaos = require('../../..');
const teaosTool = teaos.getTools();

function listDirs(base){
  try {
    return fs.readdirSync(base).filter((name) => {
      try {
        return fs.statSync(path.join(base, name)).isDirectory();
      } catch(err){
        return false;
      }
    });
  } catch(err){
    return [];
  }
}

function scanAll(){
  const packages = teaosTool.getPackages();
  const rows = [];
  for(let i = 0; i < packages.length; i++){
    const packageName = packages[i];
    const extRoot = path.resolve(process.cwd(), 'lib', packageName, 'lib/extensions');
    const types = listDirs(extRoot);
    for(let j = 0; j < types.length; j++){
      const typeName = types[j];
      const extensions = listDirs(path.join(extRoot, typeName));
      if(!extensions.length){
        rows.push({ packageName, extensionType: typeName, extensionName: null });
        continue;
      }
      for(let k = 0; k < extensions.length; k++){
        rows.push({ packageName, extensionType: typeName, extensionName: extensions[k] });
      }
    }
  }
  return rows;
}

teaos.declare({
  type: 'teaos-tool',
  name: 'extensions',
  title: 'List extensions',
  description: 'List discovered extensions across local lib packages.',
  func: (argv) => {
    const arg3 = argv[3];
    const arg4 = argv[4];
    const rows = scanAll();

    if(arg3 === '--all'){
      console.log(rows.map((row) => row.packageName + '.' + row.extensionType));
      return;
    }

    if(arg3 === '--type' && arg4){
      console.log(rows.filter((row) => row.extensionType === arg4));
      return;
    }

    if(arg3 === '--package' && arg4){
      console.log(rows.filter((row) => row.packageName === arg4));
      return;
    }

    console.log(rows);
  }
});
