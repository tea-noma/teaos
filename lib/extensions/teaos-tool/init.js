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

function ensureTeaosConfig(root){
  const teaosFile = path.join(root, 'teaos.json');
  if(fs.existsSync(teaosFile)){
    return;
  }

  const pkg = readJson(path.join(root, 'package.json')) || {};
  const initial = {
    name: pkg.name || path.basename(root),
    dependencies: (pkg.dependencies && (typeof pkg.dependencies === 'object')) ? pkg.dependencies : {}
  };
  writeJson(teaosFile, initial);
}

teaos.declare({
  type: 'teaos-tool',
  name: 'init',
  title: 'Initialize teaos project',
  description: 'Create teaos.json in the current project when missing.',
  func: () => {
    ensureTeaosConfig(process.cwd());
  }
});
