const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
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

function setDependency(configPath, depName){
  const config = ensureConfig(configPath);
  if(depName[0] === '@'){
    config.dependencies[depName] = '*';
  }else if(!config.dependencies[depName]){
    config.dependencies[depName] = '*';
  }
  writeJson(configPath, config);
}

function runCommand(command, args, cwd){
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if(result.status !== 0){
    process.exit(result.status || 1);
  }
}

function normalizeInstallName(depName){
  if(!depName){
    return { depName: null, appName: null };
  }
  if(depName.startsWith('lib/')){
    const libName = depName.slice(4);
    return { depName: '@' + libName, appName: null };
  }
  if(depName.startsWith('apps/')){
    const appName = depName.slice(5);
    return { depName: null, appName };
  }
  return { depName, appName: null };
}

function loadDotEnv(root){
  const envPath = path.join(root, '.env');
  if(!fs.existsSync(envPath)){
    return;
  }
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for(const rawLine of lines){
    const line = rawLine.trim();
    if(!line || line.startsWith('#')){
      continue;
    }
    const idx = line.indexOf('=');
    if(idx <= 0){
      continue;
    }
    const key = line.slice(0, idx).trim();
    if(!key || process.env[key] !== undefined){
      continue;
    }
    let value = line.slice(idx + 1).trim();
    if((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))){
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function ensureTeaLibExists(root, depName){
  const libName = depName.slice(1);
  const localLibPath = path.join(root, 'lib', libName);
  if(fs.existsSync(localLibPath)){
    return;
  }

  const repo = process.env.TEAOS_REPO;
  if(!repo){
    return;
  }

  const prefix = process.env.TEAOS_REPO_PREFIX || '';
  const remote = repo.replace(/\/$/, '') + '/' + prefix + libName + '.git';
  runCommand('git', ['clone', remote, localLibPath], root);
}

function verifyDependencies(root, configPath, visited){
  const resolvedConfigPath = path.resolve(configPath);
  if(visited.has(resolvedConfigPath)){
    return;
  }
  visited.add(resolvedConfigPath);

  const config = ensureConfig(resolvedConfigPath);
  writeJson(resolvedConfigPath, config);

  for(const depName of Object.keys(config.dependencies)){
    if(depName[0] === '@'){
      const libName = depName.slice(1);
      const libDir = path.join(root, 'lib', libName);
      if(!fs.existsSync(libDir)){
        ensureTeaLibExists(root, depName);
      }
      const libConfigPath = path.join(libDir, 'teaos.json');
      if(fs.existsSync(libConfigPath)){
        verifyDependencies(root, libConfigPath, visited);
      }
    }else{
      const nodeModulePath = path.join(root, 'node_modules', depName);
      if(!fs.existsSync(nodeModulePath)){
        runCommand('npm', ['install', depName], root);
      }
    }
  }
}

function syncScope(root, targetConfigPath){
  verifyDependencies(root, targetConfigPath, new Set());
}

function install(depName){
  const target = normalizeInstallName(depName);
  const cwd = process.cwd();
  const appConfig = findScopedConfig(cwd, 'apps');
  const libConfig = findScopedConfig(cwd, 'lib');
  const root = appConfig ? findProjectRoot(path.dirname(path.dirname(appConfig))) : findProjectRoot(cwd);
  const rootConfig = path.join(root, 'teaos.json');

  loadDotEnv(root);

  if(!target.depName && !target.appName){
    if(appConfig){
      syncScope(root, appConfig);
    }else if(libConfig){
      syncScope(root, libConfig);
    }else{
      syncScope(root, rootConfig);
    }
    return;
  }

  if(target.appName){
    const appPath = path.join(root, 'apps', target.appName);
    if(fs.existsSync(appPath)){
      return;
    }
    const repo = process.env.TEAOS_REPO;
    if(!repo){
      return;
    }
    const prefix = process.env.APPS_REPO_PREFIX || '';
    const remote = repo.replace(/\/$/, '') + '/' + prefix + target.appName + '.git';
    runCommand('git', ['clone', remote, appPath], root);
    return;
  }

  if(appConfig){
    setDependency(appConfig, target.depName);
    setDependency(rootConfig, target.depName);
    syncScope(root, appConfig);
    syncScope(root, rootConfig);
    return;
  }

  if(libConfig){
    setDependency(libConfig, target.depName);
    syncScope(root, libConfig);
    return;
  }

  setDependency(rootConfig, target.depName);
  syncScope(root, rootConfig);
}

teaos.declare({
  type: 'teaos-tool',
  name: 'install',
  func: (argv) => {
    install(argv[3]);
  }
});
