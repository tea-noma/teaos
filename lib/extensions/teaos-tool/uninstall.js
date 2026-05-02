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

function ensureConfig(configPath){
  const config = readJson(configPath) || { name: path.basename(path.dirname(configPath)) };
  if(!config.dependencies || (typeof config.dependencies !== 'object')){
    config.dependencies = {};
  }
  return config;
}

function unsetDependency(configPath, depName){
  const config = ensureConfig(configPath);
  if(config.dependencies[depName] !== undefined){
    delete config.dependencies[depName];
    writeJson(configPath, config);
  }
}

function normalizeUninstallName(depName){
  if(!depName){
    return null;
  }
  if(depName.startsWith('lib/')){
    return '@' + depName.slice(4);
  }
  if(depName.startsWith('apps/')){
    return null;
  }
  return depName;
}

function uninstall(depName){
  const normalizedDepName = normalizeUninstallName(depName);
  if(!normalizedDepName){
    return;
  }

  const cwd = process.cwd();
  const appConfig = findScopedConfig(cwd, 'apps');
  const libConfig = findScopedConfig(cwd, 'lib');
  const root = appConfig ? findProjectRoot(path.dirname(path.dirname(appConfig))) : findProjectRoot(cwd);
  const rootConfig = path.join(root, 'teaos.json');

  if(appConfig){
    unsetDependency(appConfig, normalizedDepName);
    unsetDependency(rootConfig, normalizedDepName);
    return;
  }

  if(libConfig){
    unsetDependency(libConfig, normalizedDepName);
    return;
  }

  unsetDependency(rootConfig, normalizedDepName);
}

teaos.declare({
  type: 'teaos-tool',
  name: 'uninstall',
  title: 'Uninstall dependency',
  description: 'Remove dependency from teaos dependency config.',
  func: (argv) => {
    uninstall(argv[3]);
  }
});
