const fs = require('fs');
const path = require('path');
const teaos = require('../../..');

function readJson(filePath){
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch(err){
    return null;
  }
}

function writeJson(filePath, value){
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function hasMarker(dir, marker){
  return fs.existsSync(path.join(dir, marker));
}

function findProjectRoot(start){
  let current = start;
  let fallback = start;

  while(true){
    const hasTeaos = hasMarker(current, 'teaos.json');
    const hasPackage = hasMarker(current, 'package.json');
    const hasNodeModules = hasMarker(current, 'node_modules');

    if(hasTeaos || hasPackage || hasNodeModules){
      fallback = current;
      if(hasTeaos){
        return current;
      }
    }

    const parent = path.dirname(current);
    if(parent === current){
      return fallback;
    }
    current = parent;
  }
}

function findScopedConfig(start, scopeDir){
  let current = start;
  while(true){
    const parent = path.dirname(current);
    if(path.basename(parent) === scopeDir){
      return path.join(current, 'teaos.json');
    }
    if(parent === current){
      return null;
    }
    current = parent;
  }
}

function setDependency(configPath, depName){
  const config = readJson(configPath) || { name: path.basename(path.dirname(configPath)) };
  if(!config.dependencies || (typeof config.dependencies !== 'object')){
    config.dependencies = {};
  }
  if(depName[0] === '@'){
    config.dependencies[depName] = '*';
  }else if(!config.dependencies[depName]){
    config.dependencies[depName] = '*';
  }
  writeJson(configPath, config);
}

function install(depName){
  if(!depName){
    return;
  }

  const cwd = process.cwd();
  const appConfig = findScopedConfig(cwd, 'apps');
  if(appConfig){
    const root = findProjectRoot(path.dirname(path.dirname(appConfig)));
    setDependency(appConfig, depName);
    setDependency(path.join(root, 'teaos.json'), depName);
    return;
  }

  const libConfig = findScopedConfig(cwd, 'lib');
  if(libConfig){
    setDependency(libConfig, depName);
    return;
  }

  const root = findProjectRoot(cwd);
  setDependency(path.join(root, 'teaos.json'), depName);
}

teaos.declare({
  type: 'teaos-tool',
  name: 'install',
  func: (argv) => {
    install(argv[3]);
  }
});
