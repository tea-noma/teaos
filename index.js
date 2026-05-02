const fs = require('fs');
const path = require('path');
const listeners = {};

const { dependencyTrace } = require('./lib/objects/dependency-trace');

let libpath = '../../lib/';

function makeRequirePath(abs){
  for(let i = 0; i < __dirname.length; i++){
    if(__dirname[i] != abs[i]){
      for(; i >=0; i--){
        if((__dirname[i] == '/') || (__dirname[i] == '\\')){
          let ref = '';
          for(let j = i; j < __dirname.length; j++){
            if((__dirname[j] == '/') || (__dirname[j] == '\\')){
              ref += '../';
            }
          }
          return ref + abs.substr(i + 1).replace(/\\/g, '/');
        }
      }
      break;
    }
  }
  return null;
}

function teaos_set(name, value){
  switch(name){
  case 'libpath':
    libpath = value;
    break;
  default:
    break;
  }
}

function teaos_on(scope, handler){
  if(!listeners[scope]){
    listeners[scope] = [];
  }
  listeners[scope].push(handler);
}

function teaos_declare(desc){
  const funcs = listeners['declare'];
  if(funcs){
    for(let i = 0; i < funcs.length; i++){
      funcs[i].apply(null, [desc]);
    }
  }
}

function isLocalModule(name){
  return name[0] == '@';
}

function moduleName(name){
  return isLocalModule(name) ? name.substr(1) : name;
}

function moduleResolvePaths(){
  const paths = [];
  if(require.main && require.main.filename){
    paths.push(path.dirname(require.main.filename));
  }
  paths.push(process.cwd());
  paths.push(__dirname);
  return paths;
}

function resolveLocalModulePath(name){
  const p = path.resolve(__dirname, libpath + moduleName(name));
  if(fs.existsSync(p)){
    return p;
  }
  return null;
}

function resolveNodeModulePath(name){
  try {
    const pkgJson = require.resolve(moduleName(name) + '/package.json', { paths: moduleResolvePaths() });
    return path.dirname(pkgJson);
  } catch(err) {
    return null;
  }
}

function resolveNodeModuleEntry(name){
  try {
    return require.resolve(moduleName(name), { paths: moduleResolvePaths() });
  } catch(err) {
    return null;
  }
}

function resolveTeaosModulePath(name){
  if(isLocalModule(name)){
    return resolveLocalModulePath(name);
  }
  return resolveNodeModulePath(name);
}

// load modules in statically
function teaos_require(name){
  const funcs = listeners['require'];
  if(funcs){
    for(let i = 0; i < funcs.length; i++){
      funcs[i].apply(null, [name]);
    }
  }

  if(isLocalModule(name)){
    return require(libpath + moduleName(name));
  }

  const resolved = resolveNodeModuleEntry(name);
  if(resolved){
    return require(resolved);
  }
  return require(name);
}

// load modules in dynamically
function teaos_use(name, options){
  const mod = teaos_require(name);
  let inst = null;
  if(mod.use){
    inst = mod.use(options);
  }else{
    inst = mod;
  }
  if(!mod.hasOwnProperty('__teaos')){
    mod.__teaos = { extensions: teaos_extensions(name) || false };
  }
  if(options && options.resources){
    const extensions = mod.__teaos.extensions;
    if(options.resources == '*'){
      if(extensions){
        for(let k in extensions){
          teaos_require(name + '/lib/extensions/' + k);
        }
      }
    }else if(options.resources instanceof Object){
      for(let kk in options.resources){
        if(extensions[kk]){
          if(options.resources[kk] == '*'){
            teaos_require(name + '/lib/extensions/' + kk);
          }else if(options.resources[kk] instanceof Object){
            for(let k in options.resources[kk]){
              teaos_require(name + '/lib/extensions/' + kk + '/' + k);
            }
          }
        }
      }
    }
  }
  return inst;
}

function teaos_extensions(name){
  const results = {};
  try {
    const modpath = resolveTeaosModulePath(name);
    if(!modpath){
      return results;
    }

    const files = fs.readdirSync(path.join(modpath, 'lib/extensions'));
    files.forEach((file) => {
      if(file.indexOf('.') != -1){
        results[file] = true;
      }else{
        const sfiles = fs.readdirSync(path.join(modpath, 'lib/extensions/' + file));
        if(sfiles.length){
          results[file] = {};
          sfiles.forEach((sfile) => {
            results[file][sfile] = true;
          });
        }
      }
    });
  }catch(err){
    return results;
  }
  return results;
}

function teaos_getTools(){
  return require('./lib/objects/teaos-tool');
}

function teaos_dependencies(lpath, options){
  return dependencyTrace(lpath, options).allDependencies;
}

function teaos_localDependencies(lpath, options){
  return dependencyTrace(lpath, options).allLocalDependencies;
}

function readJsonFile(filePath){
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch(err){
    return null;
  }
}

function getProjectRoot(){
  const teaosDir = path.resolve(__dirname);
  const parts = teaosDir.split(path.sep);
  const nodeModulesIndex = parts.lastIndexOf('node_modules');
  if(nodeModulesIndex !== -1 && parts[nodeModulesIndex + 1] === 'teaos'){
    return parts.slice(0, nodeModulesIndex).join(path.sep) || path.sep;
  }
  if(require.main && require.main.filename){
    return path.dirname(path.resolve(require.main.filename));
  }
  return process.cwd();
}

function teaos_attr(name){
  const root = getProjectRoot();
  switch(name){
  case 'root':
    return root;
  case 'name': {
    const pkg = readJsonFile(path.join(root, 'package.json'));
    if(pkg && pkg.name){
      return pkg.name;
    }
    const teaosConfig = readJsonFile(path.join(root, 'teaos.json'));
    if(teaosConfig && teaosConfig.name){
      return teaosConfig.name;
    }
    return path.basename(root);
  }
  case 'path.@apps':
    return fs.existsSync(path.join(root, 'apps')) ? './apps' : null;
  case 'path.apps':
    return fs.existsSync(path.join(root, 'apps')) ? path.join(root, 'apps') : null;
  case 'path.@lib':
    return './lib';
  case 'path.lib':
    return fs.existsSync(path.resolve(root, '../lib')) ? path.resolve(root, '../lib') : null;
  case 'path.@tests':
    return './tests';
  case 'path.tests':
    return fs.existsSync(path.resolve(root, '../tests')) ? path.resolve(root, '../tests') : null;
  default:
    return null;
  }
}

exports.makeRequirePath = makeRequirePath;
exports.set = teaos_set;
exports.on = teaos_on;
exports.declare = teaos_declare;
exports.require = teaos_require;
exports.use = teaos_use;
exports.extensions = teaos_extensions;
exports.getTools = teaos_getTools;
exports.dependencies = teaos_dependencies;
exports.localDependencies = teaos_localDependencies;
exports.attr = teaos_attr;
