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

function ensureTeaosConfig(filePath, moduleName){
  const current = readJson(filePath);
  if(current){
    return current;
  }
  const initial = {
    name: moduleName,
    dependencies: {}
  };
  writeJson(filePath, initial);
  return initial;
}

function createModule(kind, moduleName){
  if(!moduleName){
    return;
  }
  if((kind !== 'app') && (kind !== 'lib')){
    return;
  }

  const root = process.cwd();
  const baseDir = kind === 'app' ? path.join(root, 'apps', moduleName) : path.join(root, 'lib', moduleName);
  const teaosFile = path.join(baseDir, 'teaos.json');
  const entryFile = path.join(baseDir, 'index.js');

  ensureTeaosConfig(teaosFile, (kind === 'lib' ? '@' : '') + moduleName);
  if(!fs.existsSync(entryFile)){
    fs.writeFileSync(entryFile, 'module.exports = {};\n');
  }
}

teaos.declare({
  type: 'teaos-tool',
  name: 'create',
  title: 'Create app or lib module',
  description: 'Create an app/lib module skeleton with teaos.json and index.js.',
  func: (argv) => {
    createModule(argv[3], argv[4]);
  }
});
