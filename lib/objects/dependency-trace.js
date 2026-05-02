const fs = require('fs');
const path = require('path');

function readJsonFileSafe(filePath){
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch(err){
    return null;
  }
}

function normalizeDependencies(value){
  if(!value || (typeof value !== 'object')){
    return [];
  }
  return Object.keys(value);
}

function unique(values){
  return Array.from(new Set(values));
}

function resolveDependencyTeaosPath(root, depName){
  if(!depName){
    return null;
  }
  if(depName[0] === '@'){
    return path.join(root, 'lib', depName.slice(1), 'teaos.json');
  }
  return path.join(root, 'node_modules', depName, 'teaos.json');
}

function findProjectRoot(start){
  let current = path.resolve(start || process.cwd());
  let fallbackTeaosRoot = null;

  while(true){
    const packagePath = path.join(current, 'package.json');
    const teaosPath = path.join(current, 'teaos.json');

    if(fs.existsSync(packagePath)){
      return current;
    }
    if(!fallbackTeaosRoot && fs.existsSync(teaosPath)){
      fallbackTeaosRoot = current;
    }

    const parent = path.dirname(current);
    if(parent === current){
      return fallbackTeaosRoot || path.resolve(start || process.cwd());
    }
    current = parent;
  }
}

function dependencyTrace(lpath, options){
  const recursive = !!(options && options.recursive);
  const root = findProjectRoot(lpath || process.cwd());
  const startConfigPath = path.join(path.resolve(lpath || process.cwd()), 'teaos.json');
  const startConfig = readJsonFileSafe(startConfigPath);
  if(!startConfig){
    return {
      dependencies: [],
      localDependencies: [],
      allDependencies: [],
      allLocalDependencies: []
    };
  }

  const directDependencies = normalizeDependencies(startConfig.dependencies);
  const directLocalDependencies = directDependencies.filter((name) => name[0] === '@');

  if(!recursive){
    return {
      dependencies: unique(directDependencies),
      localDependencies: unique(directLocalDependencies),
      allDependencies: unique(directDependencies),
      allLocalDependencies: unique(directLocalDependencies)
    };
  }

  const allDependencies = [];
  const allLocalDependencies = [];
  const queue = [...directDependencies];
  const seenDependencyNames = new Set();
  const visitedTeaosPaths = new Set([path.resolve(startConfigPath)]);

  while(queue.length){
    const depName = queue.shift();
    if(!depName || seenDependencyNames.has(depName)){
      continue;
    }
    seenDependencyNames.add(depName);
    allDependencies.push(depName);
    if(depName[0] === '@'){
      allLocalDependencies.push(depName);
    }

    const depTeaosPath = resolveDependencyTeaosPath(root, depName);
    if(!depTeaosPath || !fs.existsSync(depTeaosPath)){
      continue;
    }
    const resolvedTeaosPath = path.resolve(depTeaosPath);
    if(visitedTeaosPaths.has(resolvedTeaosPath)){
      continue;
    }
    visitedTeaosPaths.add(resolvedTeaosPath);

    const depConfig = readJsonFileSafe(depTeaosPath);
    if(!depConfig){
      continue;
    }
    const nestedDeps = normalizeDependencies(depConfig.dependencies);
    for(let i = 0; i < nestedDeps.length; i++){
      if(!seenDependencyNames.has(nestedDeps[i])){
        queue.push(nestedDeps[i]);
      }
    }
  }

  return {
    dependencies: unique(directDependencies),
    localDependencies: unique(directLocalDependencies),
    allDependencies: unique(allDependencies),
    allLocalDependencies: unique(allLocalDependencies)
  };
}

module.exports = {
  dependencyTrace
};
