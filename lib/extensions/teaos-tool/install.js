const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
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

function pathStat(file){
  try { return fs.lstatSync(file); }
  catch(err){
    if(err.code === 'ENOENT') return null;
    throw err;
  }
}

function validAppConfig(file){
  const config = readJson(file);
  return !!(config && typeof config.name === 'string' && config.name.trim() &&
    (!Object.hasOwn(config, 'dependencies') ||
      (config.dependencies && typeof config.dependencies === 'object' && !Array.isArray(config.dependencies))));
}

function projectLayout(root, allowEmptyApps = false){
  const appsPath = path.join(root, 'apps');
  const stat = pathStat(appsPath);
  if(!stat) return {kind: 'single', appConfigs: []};
  if(!stat.isDirectory() || stat.isSymbolicLink()){
    throw new Error('apps must be a real directory: ' + appsPath);
  }
  const appConfigs = fs.readdirSync(appsPath, {withFileTypes: true})
    .filter(entry => entry.isDirectory() && !entry.isSymbolicLink())
    .map(entry => path.join(appsPath, entry.name, 'teaos.json'))
    .filter(validAppConfig)
    .sort();
  if(appConfigs.length === 0 && !allowEmptyApps){
    throw new Error('apps exists but contains no valid app teaos.json: ' + appsPath);
  }
  return {kind: 'multi', appConfigs};
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
  let lockSource = 'local';
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
    }else if(arg === '--lock-source'){
      if(i + 1 >= argv.length) throw new Error('--lock-source requires local or remote');
      lockSource = argv[++i];
    }else if(arg.startsWith('--lock-source=')){
      lockSource = arg.slice('--lock-source='.length);
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
  if(!['local', 'remote'].includes(lockSource)) throw new Error('invalid lock source: ' + lockSource);
  return {depName, mode, user, gitUrl, lockSource};
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

function repositoryOverrides(configPath){
  const config = fs.existsSync(configPath) ? readJson(configPath) : null;
  const entries = config && config.repositories;
  if(entries === undefined) return {};
  if(!entries || typeof entries !== 'object' || Array.isArray(entries)){
    throw new Error('teaos.json repositories must be an object: ' + configPath);
  }
  for(const [key, url] of Object.entries(entries)){
    if(!/^(?:apps\/|lib\/)[A-Za-z0-9][A-Za-z0-9._-]*$/.test(key) ||
      typeof url !== 'string' || !url.trim() || /\s/.test(url)){
      throw new Error('invalid teaos.json repository mapping: ' + key);
    }
  }
  return entries;
}

function configuredRepositoryUrl(root, scopeConfig, key){
  const rootConfig = path.join(root, 'teaos.json');
  const rootEntries = repositoryOverrides(rootConfig);
  const scopeEntries = path.resolve(scopeConfig) === path.resolve(rootConfig) ? rootEntries :
    repositoryOverrides(scopeConfig);
  return scopeEntries[key] || rootEntries[key] || null;
}

function repositoryUrl(root, scopeConfig, key, repo){
  const configured = configuredRepositoryUrl(root, scopeConfig, key);
  if(configured) return configured;
  if(!repo) return null;
  const [kind, name] = key.split('/');
  const prefix = kind === 'apps' ? process.env.APPS_REPO_PREFIX || '' :
    process.env.TEAOS_REPO_PREFIX || '';
  return repo + '/' + prefix + name + '.git';
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

function ensureTeaLibExists(root, depName, mode, remote, entry){
  const libName = depName.slice(1);
  const localLibPath = path.join(root, 'lib', libName);
  if(fs.existsSync(localLibPath)){
    return null;
  }
  if(!remote && !entry) return null;

  return cloneRepository(entry ? entry.remote : remote, localLibPath, root, mode, entry && entry.commit);
}

function validateLock(lock, label){
  if(!lock || lock.lockfileVersion !== 1 || !lock.packages ||
    typeof lock.packages !== 'object' || Array.isArray(lock.packages) ||
    !lock.dependencies || typeof lock.dependencies !== 'object' || Array.isArray(lock.dependencies)){
    throw new Error('invalid teaos-lock.json: ' + label);
  }
  for(const [name, entry] of Object.entries(lock.packages)){
    if(!/^@[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || !entry ||
      typeof entry.remote !== 'string' || !entry.remote ||
      !COMMIT.test(entry.commit) || !COMMIT.test(entry.tree)){
      throw new Error('invalid teaos-lock.json package: ' + name);
    }
  }
  if(lock.application !== undefined && (!lock.application ||
    typeof lock.application.remote !== 'string' || !lock.application.remote)){
    throw new Error('invalid teaos-lock.json application: ' + label);
  }
  return lock;
}

function readLock(lockPath){
  return fs.existsSync(lockPath) ? validateLock(readJson(lockPath), lockPath) : null;
}

function writeLock(lockPath, lock){
  const temporary = lockPath + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(lock, null, 2) + '\n');
  fs.renameSync(temporary, lockPath);
}

function lockIdentity(lock){
  const packages = Object.fromEntries(Object.entries(lock.packages)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, entry]) => [name, {remote: entry.remote, commit: entry.commit, tree: entry.tree}]));
  const dependencies = Object.fromEntries(Object.entries(lock.dependencies)
    .sort(([a], [b]) => a.localeCompare(b)));
  return crypto.createHash('sha256').update(JSON.stringify({dependencies, packages})).digest('hex');
}

function capture(command, args, cwd, description){
  const result = spawnSync(command, args, {cwd, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024});
  if(result.status !== 0){
    throw new Error(description + ': ' + (result.stderr || result.error || 'command failed').toString().trim());
  }
  return result.stdout.trim();
}

function appRemote(appPath, repo, root, current, required = true){
  if(current && current.application) return current.application.remote;
  const config = readJson(path.join(appPath, 'teaos.json'));
  const appName = path.basename(path.dirname(appPath)) === 'apps' ? path.basename(appPath) :
    (config && typeof config.name === 'string' ? config.name : path.basename(appPath));
  const configured = configuredRepositoryUrl(root, path.join(appPath, 'teaos.json'), 'apps/' + appName);
  if(configured) return configured;
  if(gitLocal.gitDirectory(appPath)){
    const result = spawnSync('git', ['config', '--get', 'remote.origin.url'], {
      cwd: appPath, encoding: 'utf8', timeout: 10000,
    });
    if(result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  const remote = repositoryUrl(root, path.join(appPath, 'teaos.json'), 'apps/' + appName, repo);
  if(!remote && required) throw new Error('remote lock requires the app origin or an explicit repository URL');
  return remote;
}

function removeOwnedTemporary(directory){
  const resolved = fs.realpathSync(directory);
  const base = fs.realpathSync(os.tmpdir());
  if(path.dirname(resolved) !== base || !path.basename(resolved).startsWith('teaos-lock-')){
    throw new Error('refusing to remove unexpected temporary directory: ' + directory);
  }
  const pending = [resolved];
  while(pending.length){
    const current = pending.pop();
    for(const item of fs.readdirSync(current, {withFileTypes: true})){
      const child = path.join(current, item.name);
      const stat = fs.lstatSync(child);
      if(stat.isSymbolicLink()) throw new Error('temporary Git directory contains a symlink: ' + child);
      if(stat.isDirectory()) pending.push(child);
    }
  }
  fs.rmSync(resolved, {recursive: true});
}

function fetchRemoteLock(remote, current, appPath){
  const tip = capture('git', ['ls-remote', remote, 'HEAD'], process.cwd(), 'cannot inspect app remote')
    .split(/\s+/, 1)[0];
  if(!COMMIT.test(tip)) throw new Error('app remote has no HEAD commit');
  if(current && current.upstream && current.upstream.remote === remote &&
    current.upstream.commit === tip && current.upstream.lockIdentity === lockIdentity(current)){
    return {lock: current, unchanged: true};
  }
  let content;
  if(gitLocal.gitDirectory(appPath)){
    capture('git', ['fetch', '--no-tags', remote, tip], appPath, 'cannot fetch app lock');
    content = capture('git', ['show', tip + ':teaos-lock.json'],
      appPath, 'remote app has no teaos-lock.json');
  }else{
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'teaos-lock-'));
    try {
      capture('git', ['init', '--bare', temporary], process.cwd(), 'cannot initialize temporary Git repository');
      capture('git', ['--git-dir', temporary, 'fetch', '--depth=1', remote, tip],
        process.cwd(), 'cannot fetch app lock');
      content = capture('git', ['--git-dir', temporary, 'show', 'FETCH_HEAD:teaos-lock.json'],
        process.cwd(), 'remote app has no teaos-lock.json');
    } finally {
      removeOwnedTemporary(temporary);
    }
  }
  let lock;
  try { lock = JSON.parse(content); }
  catch(err){ throw new Error('remote teaos-lock.json is not valid JSON: ' + err.message); }
  validateLock(lock, remote);
  return {lock: {...lock, upstream: {remote, commit: tip, lockIdentity: lockIdentity(lock)}}, unchanged: false};
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
    if(state.explicitRepositories.has(depName)){
      throw new Error('cannot verify existing files-only library against repository mapping: ' + depName);
    }
    state.incomplete.push(depName + ' has no Git snapshot');
    return;
  }
  if(!clonedSnapshot){
    if(gitLocal.isDirty(target)){
      state.incomplete.push(depName + ' has uncommitted changes');
      return;
    }
    const published = publishedRemote(target, snapshot);
    if(!published){
      state.incomplete.push(depName + ' is not confirmed at the remote tip');
      return;
    }
    if(state.explicitRepositories.has(depName) && published !== remote){
      throw new Error('existing library origin differs from teaos.json repository mapping: ' + depName);
    }
    remote = published;
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
      const remote = repositoryUrl(root, state.scopeConfig, 'lib/' + libName, repo);
      if(configuredRepositoryUrl(root, state.scopeConfig, 'lib/' + libName)){
        state.explicitRepositories.add(depName);
      }
      let clonedSnapshot = null;
      if(!fs.existsSync(libDir)){
        clonedSnapshot = ensureTeaLibExists(root, depName, mode, remote, locked);
      }
      if(!fs.existsSync(libDir)){
        if(state.previous) throw new Error('locked dependency cannot be fetched: ' + depName);
        state.incomplete.push(depName + ' is not installed');
        continue;
      }
      if(fs.existsSync(libDir)) recordPackage(state, depName, libDir,
        locked ? locked.remote : remote, clonedSnapshot);
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
  const state = {previous, next: {lockfileVersion: 1, dependencies, packages: {},
    ...(previous && previous.upstream ? {upstream: previous.upstream} : {})},
    incomplete: [], allowNew: !!allowNew, updated: false, mode, scopeConfig: targetConfigPath,
    explicitRepositories: new Set()};
  const scopeDir = path.dirname(targetConfigPath);
  if((scopeDir === root && !fs.existsSync(path.join(root, 'apps'))) ||
    path.basename(path.dirname(scopeDir)) === 'apps'){
    const remote = appRemote(scopeDir, repo, root, previous, false);
    if(remote) state.next.application = {remote};
  }
  verifyDependencies(root, targetConfigPath, new Set(), mode, repo, state);
  if(previous && (state.updated || JSON.stringify(previous.dependencies) !== JSON.stringify(dependencies))){
    delete state.next.upstream;
  }
  if(state.incomplete.length){
    console.warn('teaos-lock.json was not updated: ' + state.incomplete.join('; '));
  }else if(!previous || state.updated || JSON.stringify(previous) !== JSON.stringify(state.next)){
    writeLock(lockPath, state.next);
  }
}

function validateRemoteClosure(appConfig, root, remoteLock, staged){
  const pending = Object.keys(ensureConfig(appConfig).dependencies).filter(name => name.startsWith('@'));
  const visited = new Set();
  while(pending.length){
    const name = pending.pop();
    if(visited.has(name)) continue;
    visited.add(name);
    if(!Object.hasOwn(remoteLock.packages, name)){
      throw new Error('remote lock is missing transitive dependency: ' + name);
    }
    const directory = staged.get(name) || path.join(root, 'lib', name.slice(1));
    const config = readJson(path.join(directory, 'teaos.json'));
    if(!config || !config.dependencies || typeof config.dependencies !== 'object'){
      throw new Error('dependency has no valid teaos.json: ' + name);
    }
    for(const child of Object.keys(config.dependencies)){
      if(child.startsWith('apps/') || child.startsWith('@apps/')){
        throw new Error('application dependencies are not supported: ' + child);
      }
      if(child.startsWith('@')) pending.push(child);
    }
  }
}

function installRemoteLock(root, appConfig, mode, repo){
  if(!fs.existsSync(appConfig)) throw new Error('remote lock requires an installed app teaos.json');
  const appPath = path.dirname(appConfig);
  const lockPath = path.join(appPath, 'teaos-lock.json');
  const localLock = readLock(lockPath);
  const remote = appRemote(appPath, repo, root, localLock);
  const fetched = fetchRemoteLock(remote, localLock, appPath);
  if(fetched.unchanged){
    syncScope(root, appConfig, mode, repo);
    return;
  }
  const remoteLock = fetched.lock;
  const direct = Object.fromEntries(Object.entries(ensureConfig(appConfig).dependencies)
    .sort(([a], [b]) => a.localeCompare(b)));
  const remoteDirect = Object.fromEntries(Object.entries(remoteLock.dependencies)
    .sort(([a], [b]) => a.localeCompare(b)));
  if(JSON.stringify(remoteDirect) !== JSON.stringify(direct)){
    throw new Error('remote lock dependencies differ from local app teaos.json; update the app checkout first');
  }

  const libRoot = path.join(root, 'lib');
  fs.mkdirSync(libRoot, {recursive: true});
  const libStat = fs.lstatSync(libRoot);
  if(!libStat.isDirectory() || libStat.isSymbolicLink()){
    throw new Error('refusing to stage libraries under a non-directory or symlink: ' + libRoot);
  }
  const nextLock = {...remoteLock, application: {remote}, packages: {...remoteLock.packages}};
  const planned = [];
  for(const [name, entry] of Object.entries(remoteLock.packages)){
    const target = path.join(libRoot, name.slice(1));
    const old = localLock && localLock.packages[name];
    const stat = pathStat(target);
    const exists = !!stat;
    if(stat){
      if(!stat.isDirectory() || stat.isSymbolicLink()){
        throw new Error('refusing to update non-directory library: ' + target);
      }
      const snapshot = gitLocal.readSnapshot(target);
      if(old) verifyLockedCheckout(target, old, snapshot);
      else verifyLockedCheckout(target, entry, snapshot);
    }
    const unchanged = old && old.commit === entry.commit && old.tree === entry.tree &&
      old.remote === entry.remote;
    if(exists && (unchanged || !old)){
      if(old && old.contentHash && !entry.contentHash){
        nextLock.packages[name] = {...entry, contentHash: old.contentHash};
      }
      continue;
    }
    planned.push({name, entry, target, exists});
  }
  if(planned.length === 0){
    validateRemoteClosure(appConfig, root, nextLock, new Map());
    writeLock(lockPath, nextLock);
    return;
  }

  const stageRoot = fs.mkdtempSync(path.join(libRoot, '.teaos-stage-'));
  const staged = new Map();
  const changes = [];
  for(const {name, entry, target, exists} of planned){
    const stage = path.join(stageRoot, name.slice(1));
    const cloned = cloneRepository(entry.remote, stage, root, mode, entry.commit);
    const verified = verifyLockedCheckout(stage, entry, gitLocal.readSnapshot(stage), cloned);
    nextLock.packages[name] = verified;
    staged.set(name, stage);
    changes.push({name, target, stage, backup: path.join(stageRoot, '.previous-' + name.slice(1)), exists});
  }
  validateRemoteClosure(appConfig, root, nextLock, staged);

  const swapped = [];
  try {
    for(const change of changes){
      if(change.exists) fs.renameSync(change.target, change.backup);
      try { fs.renameSync(change.stage, change.target); }
      catch(err){
        if(change.exists) fs.renameSync(change.backup, change.target);
        throw err;
      }
      swapped.push(change);
    }
    writeLock(lockPath, nextLock);
  } catch(err){
    for(const change of swapped.reverse()){
      fs.renameSync(change.target, change.stage);
      if(change.exists) fs.renameSync(change.backup, change.target);
    }
    throw err;
  }
  if(changes.some(change => change.exists)){
    console.warn('Previous library checkouts were retained at ' + stageRoot);
  }else if(fs.readdirSync(stageRoot).length === 0){
    fs.rmdirSync(stageRoot);
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
  const layout = projectLayout(root, !!target.appName);
  if(appConfig && !layout.appConfigs.includes(path.resolve(appConfig))){
    throw new Error('current app has no valid teaos.json: ' + appConfig);
  }

  if(options.lockSource === 'remote'){
    if(target.depName) throw new Error('--lock-source=remote cannot be combined with a dependency name');
    if(target.appName){
      const appPath = path.join(root, 'apps', target.appName);
      if(!fs.existsSync(appPath)){
        const remote = repositoryUrl(root, rootConfig, 'apps/' + target.appName, repo);
        if(!remote) throw new Error('repository URL is required to install an app');
        cloneRepository(remote, appPath, root, mode);
      }
      if(!projectLayout(root).appConfigs.includes(path.join(appPath, 'teaos.json'))){
        throw new Error('installed app has no valid teaos.json: ' + appPath);
      }
      installRemoteLock(root, path.join(appPath, 'teaos.json'), mode, repo);
    }else if(appConfig){
      installRemoteLock(root, appConfig, mode, repo);
    }else if(layout.kind === 'single' && validAppConfig(rootConfig)){
      installRemoteLock(root, rootConfig, mode, repo);
    }else{
      throw new Error('--lock-source=remote requires a single root app or apps/APPNAME');
    }
    return;
  }

  if(!target.depName && !target.appName){
    if(appConfig){
      syncScope(root, appConfig, mode, repo);
    }else if(libConfig){
      syncScope(root, libConfig, mode, repo);
    }else if(layout.kind === 'multi'){
      if(fs.existsSync(rootConfig)) syncScope(root, rootConfig, mode, repo);
    }else{
      if(!validAppConfig(rootConfig)) throw new Error('single app has no valid root teaos.json: ' + rootConfig);
      syncScope(root, rootConfig, mode, repo);
    }
    return;
  }

  if(target.appName){
    const appPath = path.join(root, 'apps', target.appName);
    if(!fs.existsSync(appPath)){
      const remote = repositoryUrl(root, rootConfig, 'apps/' + target.appName, repo);
      if(!remote){
        if(layout.appConfigs.length === 0 && layout.kind === 'multi'){
          throw new Error('apps exists but contains no valid app teaos.json: ' + path.join(root, 'apps'));
        }
        return;
      }
      cloneRepository(remote, appPath, root, mode);
    }
    const appConfigPath = path.join(appPath, 'teaos.json');
    if(!projectLayout(root).appConfigs.includes(appConfigPath)){
      throw new Error('installed app has no valid teaos.json: ' + appPath);
    }
    syncScope(root, appConfigPath, mode, repo);
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
