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

function scanPackageExtensions(packageName){
  const root = path.resolve(process.cwd(), 'lib', packageName, 'lib/extensions');
  const results = [];
  const types = listDirs(root);
  for(let i = 0; i < types.length; i++){
    const typeName = types[i];
    const files = listDirs(path.join(root, typeName));
    if(!files.length){
      results.push({ packageName, extensionType: typeName, extensionName: null });
      continue;
    }
    for(let j = 0; j < files.length; j++){
      results.push({ packageName, extensionType: typeName, extensionName: files[j] });
    }
  }
  return results;
}

teaos.declare({
  type: 'teaos-tool',
  name: 'ls',
  title: 'List local packages',
  description: 'List local lib/apps packages and extension summaries.',
  func: (argv) => {
    const results = teaosTool.getPackages();
    const arg3 = argv[3];
    const arg4 = argv[4];

    if(arg3 === '-l'){
      const detailed = [];
      for(let i = 0; i < results.length; i++){
        detailed.push({ package: results[i], extensions: scanPackageExtensions(results[i]) });
      }
      console.log(detailed);
      return;
    }

    if(arg3 === 'apps'){
      const appsPath = path.resolve(process.cwd(), 'apps');
      console.log(listDirs(appsPath));
      return;
    }

    if(arg3 === 'lib'){
      console.log(results);
      return;
    }

    if(arg3 === '--extension-type' && arg4){
      const matched = [];
      for(let i = 0; i < results.length; i++){
        const exts = scanPackageExtensions(results[i]);
        const hasType = exts.some((ext) => ext.extensionType === arg4);
        if(hasType){
          matched.push(results[i]);
        }
      }
      console.log(matched);
      return;
    }

    console.log(results);
  }
});
