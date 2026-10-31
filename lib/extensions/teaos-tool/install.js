const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const teaos = require('../../..');
const gitLocal = require('../../objects/git-local');
const {contentHash} = require('../../objects/install-lock');

const COMMIT = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i;

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

function parseInstallArgs(argv){
  let depName = null;
  let mode = null;
  let user = null;
  let gitUrl = null;
  for(let i = 0; i < argv.length; i++){
    const arg = argv[i];
    if(arg === '--mode'){
      if(i + 1 >= argv.length) throw new Error('--mode requires full, shallow, or files');
      mode = argv[++i];
    }else if(arg.startsWith('--mode=')){
      mode = arg.slice('--mode='.length);
    }else if(arg === '--shallow'){
      mode = 'shallow';
    }else if(arg === '--files-only'){
      mode = 'files';
    }else if(arg === '--user' || arg === '--git-url'){
      if(i + 1 >= argv.length || !argv[i + 1] || argv[i + 1].startsWith('--')){
        throw new Error(arg + ' requires a value');
      }
      if(arg === '--user') user = argv[++i];
      else gitUrl = argv[++i];
    }else if(arg.startsWith('--user=')){
      user = arg.slice('--user='.length);
    }else if(arg.startsWith('--git-url=')){
      gitUrl = arg.slice('--git-url='.length);
    }else if(arg.startsWith('-')){
      throw new Error('unknown install option: ' + arg);
    }else if(depName === null){
      depName = arg;
    }else{
      throw new Error('install accepts only one target');
    }
  }
  if(mode !== null && !['full', 'shallow', 'files'].includes(mode)){
    throw new Error('invalid install mode: ' + mode);
  }
  if(user !== null && !/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(user)){
    throw new Error('invalid GitHub user: ' + user);
  }
  if(gitUrl !== null && (!gitUrl.trim() || /\s/.test(gitUrl))){
    throw new Error('invalid Git repository base URL');
  }
  return {depName, mode, user, gitUrl};
}

function repositoryBase(options){
  if(options.gitUrl) return options.gitUrl.replace(/\/+$/, '');
  if(options.user) return 'https://github.com/' + options.user;
  if(process.env.TEAOS_REPO) return process.env.TEAOS_REPO.replace(/\/+$/, '');
  const user = process.env.TEAOS_USER;
  if(!user) return null;
  if(!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(user)){
    throw new Error('invalid TEAOS_USER: ' + user);
  }
  return 'https://github.com/' + user;
}

function removeCloneMetadata(target){
  const targetReal = fs.realpathSync(target);
  const gitPath = path.join(target, '.git');
  const gitStat = fs.lstatSync(gitPath);
  if(!gitStat.isDirectory() || gitStat.isSymbolicLink() || path.dirname(fs.realpathSync(gitPath)) !== targetReal){
    throw new Error('refusing to remove unexpected Git metadata: ' + gitPath);
  }
  // Inspect the exact metadata tree before removing this newly cloned .git.
  const pending = [gitPath];
  while(pending.length){
    const directory = pending.pop();
    for(const entry of fs.readdirSync(directory, {withFileTypes: true})){
      const item = path.join(directory, entry.name);
      const stat = fs.lstatSync(item);
      if(stat.isSymbolicLink()) throw new Error('refusing to traverse Git metadata symlink: ' + item);
      if(stat.isDirectory()) pending.push(item);
    }
  }
  fs.rmSync(gitPath, {recursive: true});
}

function cloneRepository(remote, target, root, mode, pinned){
  const args = ['clone'];
  if(mode !== 'full') args.push('--depth=1', '--single-branch');
  args.push(remote, target);
  runCommand('git', args, root);
  if(pinned){
    if(!COMMIT.test(pinned)) throw new Error('invalid locked commit');
    const available = spawnSync('git', ['cat-file', '-e', pinned + '^{commit}'], {cwd: target, stdio: 'ignore'});
    if(available.status !== 0) runCommand('git', ['fetch', 'origin', pinned], target);
    runCommand('git', ['checkout', '--detach', pinned], target);
  }
  // Resolve the checkout identity before files mode discards .git.
  // An empty repository legitimately has no HEAD yet.
  const snapshot = fs.existsSync(path.join(target, '.git')) ? gitLocal.readSnapshot(target) : null;
  if(mode === 'files') removeCloneMetadata(target);
  return snapshot;
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

function ensureTeaLibExists(root, depName, mode, repo, entry){
  const libName = depName.slice(1);
  const localLibPath = path.join(root, 'lib', libName);
  if(fs.existsSync(localLibPath)){
    return null;
  }
  if(!repo && !entry) return null;

  const prefix = process.env.TEAOS_REPO_PREFIX || '';
  const remote = entry ? entry.remote : repo + '/' + prefix + libName + '.git';
  return cloneRepository(remote, localLibPath, root, mode, entry && entry.commit);
}

function readLock(lockPath){
  if(!fs.existsSync(lockPath)) return null;
  const lock = readJson(lockPath);
  if(!lock || lock.lockfileVersion !== 1 || !lock.packages ||
    typeof lock.packages !== 'object' || Array.isArray(lock.packages) ||
    !lock.dependencies || typeof lock.dependencies !== 'object' || Array.isArray(lock.dependencies)){
    throw new Error('invalid teaos-lock.json: ' + lockPath);
  }
  return lock;
}

function writeLock(lockPath, lock){
  const temporary = lockPath + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(lock, null, 2) + '\n');
  fs.renameSync(temporary, lockPath);
}

function lockEntry(remote, snapshot, target, mode){
  if(!snapshot) return null;
  const entry = {remote, commit: snapshot.commit, tree: snapshot.tree};
  if(mode === 'files') entry.contentHash = contentHash(target);
  return entry;
}

function verifyLockedCheckout(target, entry, snapshot, clonedSnapshot){
  if(!entry || !COMMIT.test(entry.commit) || !COMMIT.test(entry.tree) || typeof entry.remote !== 'string'){
    throw new Error('invalid locked repository entry: ' + target);
  }
  if(snapshot){
    if(snapshot.commit !== entry.commit || snapshot.tree !== entry.tree || gitLocal.isDirty(target)){
      throw new Error('local repository differs from teaos-lock.json (left untouched): ' + target);
    }
    return entry;
  }
  if(entry.contentHash){
    if(contentHash(target) !== entry.contentHash){
      throw new Error('local files differ from teaos-lock.json (left untouched): ' + target);
    }
    return entry;
  }
  if(clonedSnapshot && clonedSnapshot.commit === entry.commit && clonedSnapshot.tree === entry.tree){
    return {...entry, contentHash: contentHash(target)};
  }
  throw new Error('files-only checkout cannot be verified without a content hash: ' + target);
}

function publishedRemote(root, snapshot){
  if(!snapshot.ref) return null;
  const remoteResult = spawnSync('git', ['config', '--get', 'remote.origin.url'], {
    cwd: root, encoding: 'utf8', timeout: 10000,
  });
  if(remoteResult.status !== 0) return null;
  const remote = remoteResult.stdout.trim();
  if(!remote) return null;
  const result = spawnSync('git', ['ls-remote', remote, snapshot.ref], {
    cwd: root, encoding: 'utf8', timeout: 10000,
  });
  if(result.status !== 0) return null;
  const remoteCommit = result.stdout.trim().split(/\s+/, 1)[0];
  return remoteCommit === snapshot.commit ? remote : null;
}

function recordPackage(state, depName, target, remote, clonedSnapshot){
  const locked = state.previous && state.previous.packages[depName];
  if(state.previous && !locked && !state.allowNew){
    throw new Error('dependency is absent from teaos-lock.json: ' + depName);
  }
  const localSnapshot = gitLocal.readSnapshot(target);
  const snapshot = localSnapshot || clonedSnapshot;
  if(locked){
    const verified = verifyLockedCheckout(target, locked, localSnapshot, clonedSnapshot);
    state.next.packages[depName] = verified;
    if(verified !== locked) state.updated = true;
    return;
  }
  if(!snapshot){
    state.incomplete.push(depName + ' has no Git snapshot');
    return;
  }
  if(!clonedSnapshot){
    if(gitLocal.isDirty(target)){
      state.incomplete.push(depName + ' has uncommitted changes');
      return;
    }
    remote = publishedRemote(target, snapshot);
    if(!remote){
      state.incomplete.push(depName + ' is not confirmed at the remote tip');
      return;
    }
  }
  state.next.packages[depName] = lockEntry(remote, snapshot, target, state.mode);
  state.updated = true;
}

function verifyDependencies(root, configPath, visited, mode, repo, state){
  const resolvedConfigPath = path.resolve(configPath);
  if(visited.has(resolvedConfigPath)){
    return;
  }
  visited.add(resolvedConfigPath);

  const config = ensureConfig(resolvedConfigPath);

  for(const depName of Object.keys(config.dependencies)){
    if(depName.startsWith('apps/') || depName.startsWith('@apps/')){
      throw new Error('application dependencies are not supported: ' + depName + '; use lib/@name or an npm package');
    }
    if(depName[0] === '@'){
      const libName = depName.slice(1);
      const libDir = path.join(root, 'lib', libName);
      const locked = state.previous && state.previous.packages[depName];
      let clonedSnapshot = null;
      if(!fs.existsSync(libDir)){
        clonedSnapshot = ensureTeaLibExists(root, depName, mode, repo, locked);
      }
      if(!fs.existsSync(libDir)){
        if(state.previous) throw new Error('locked dependency cannot be fetched: ' + depName);
        state.incomplete.push(depName + ' is not installed');
        continue;
      }
      if(fs.existsSync(libDir)) recordPackage(state, depName, libDir,
        locked ? locked.remote : repo + '/' + (process.env.TEAOS_REPO_PREFIX || '') + libName + '.git', clonedSnapshot);
      const libConfigPath = path.join(libDir, 'teaos.json');
      if(fs.existsSync(libConfigPath)){
        verifyDependencies(root, libConfigPath, visited, mode, repo, state);
      }
    }else{
      const nodeModulePath = path.join(root, 'node_modules', depName);
      if(!fs.existsSync(nodeModulePath)){
        runCommand('npm', ['install', depName], root);
      }
    }
  }
}

function syncScope(root, targetConfigPath, mode, repo, allowNew){
  if(!fs.existsSync(targetConfigPath)) return;
  const lockPath = path.join(path.dirname(targetConfigPath), 'teaos-lock.json');
  const previous = readLock(lockPath);
  const direct = ensureConfig(targetConfigPath).dependencies;
  const dependencies = Object.fromEntries(Object.entries(direct).sort(([a], [b]) => a.localeCompare(b)));
  if(previous && !allowNew && JSON.stringify(previous.dependencies) !== JSON.stringify(dependencies)){
    throw new Error('teaos.json dependencies differ from teaos-lock.json: ' + targetConfigPath);
  }
  const state = {previous, next: {lockfileVersion: 1, dependencies, packages: {}},
    incomplete: [], allowNew: !!allowNew, updated: false, mode};
  verifyDependencies(root, targetConfigPath, new Set(), mode, repo, state);
  if(state.incomplete.length){
    console.warn('teaos-lock.json was not updated: ' + state.incomplete.join('; '));
  }else if(!previous || state.updated || JSON.stringify(previous) !== JSON.stringify(state.next)){
    writeLock(lockPath, state.next);
  }
}

function install(depName, mode, options = {}){
  const target = normalizeInstallName(depName);
  const cwd = process.cwd();
  const appConfig = findScopedConfig(cwd, 'apps');
  const libConfig = findScopedConfig(cwd, 'lib');
  const root = appConfig ? findProjectRoot(path.dirname(path.dirname(appConfig))) : findProjectRoot(cwd);
  const rootConfig = path.join(root, 'teaos.json');

  loadDotEnv(root);
  mode = mode || process.env.TEAOS_INSTALL_MODE || 'full';
  if(!['full', 'shallow', 'files'].includes(mode)) throw new Error('invalid install mode: ' + mode);
  const repo = repositoryBase(options);

  if(!target.depName && !target.appName){
    if(appConfig){
      syncScope(root, appConfig, mode, repo);
    }else if(libConfig){
      syncScope(root, libConfig, mode, repo);
    }else{
      syncScope(root, rootConfig, mode, repo);
    }
    return;
  }

  if(target.appName){
    const appPath = path.join(root, 'apps', target.appName);
    if(!fs.existsSync(appPath)){
      if(!repo) return;
      const prefix = process.env.APPS_REPO_PREFIX || '';
      const remote = repo + '/' + prefix + target.appName + '.git';
      cloneRepository(remote, appPath, root, mode);
    }
    const appConfigPath = path.join(appPath, 'teaos.json');
    if(fs.existsSync(appConfigPath)) syncScope(root, appConfigPath, mode, repo);
    return;
  }

  if(appConfig){
    setDependency(appConfig, target.depName);
    setDependency(rootConfig, target.depName);
    syncScope(root, appConfig, mode, repo, target.depName);
    syncScope(root, rootConfig, mode, repo, target.depName);
    return;
  }

  if(libConfig){
    setDependency(libConfig, target.depName);
    syncScope(root, libConfig, mode, repo, target.depName);
    return;
  }

  setDependency(rootConfig, target.depName);
  syncScope(root, rootConfig, mode, repo, target.depName);
}

teaos.declare({
  type: 'teaos-tool',
  name: 'install',
  title: 'Install dependency or app',
  description: 'Install dependency and synchronize teaos dependency config.',
  func: (argv) => {
    const options = parseInstallArgs(argv.slice(3));
    install(options.depName, options.mode, options);
  }
});
