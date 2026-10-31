const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {spawnSync} = require('child_process');

const SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i;

function readText(file){
  try { return fs.readFileSync(file, 'utf8').trim(); }
  catch(err){
    if(err.code === 'ENOENT') return null;
    throw err;
  }
}

function gitDirectory(worktree){
  const entry = path.join(worktree, '.git');
  let stat;
  try { stat = fs.lstatSync(entry); }
  catch(err){
    if(err.code === 'ENOENT') return null;
    throw err;
  }
  if(stat.isDirectory()) return entry;
  if(!stat.isFile()) return null;
  const match = /^gitdir:\s*(.+)$/m.exec(readText(entry) || '');
  return match ? path.resolve(worktree, match[1]) : null;
}

function commonDirectory(gitDir){
  const relative = readText(path.join(gitDir, 'commondir'));
  return relative ? path.resolve(gitDir, relative) : gitDir;
}

function readRef(gitDir, ref){
  if(!/^refs\/(?:[A-Za-z0-9_.\/-]+)$/.test(ref) || ref.includes('..') || ref.includes('//')){
    throw new Error('invalid Git ref: ' + ref);
  }
  const common = commonDirectory(gitDir);
  let value = readText(path.join(gitDir, ref)) || readText(path.join(common, ref));
  if(!value){
    const packed = readText(path.join(common, 'packed-refs')) || '';
    const line = packed.split('\n').find(line => line.endsWith(' ' + ref));
    value = line && line.split(' ')[0];
  }
  if(value && value.startsWith('ref: ')) return readRef(gitDir, value.slice(5));
  return value && SHA.test(value) ? value.toLowerCase() : null;
}

function readHead(worktree){
  const gitDir = gitDirectory(worktree);
  if(!gitDir) return null;
  const value = readText(path.join(gitDir, 'HEAD'));
  if(!value) return null;
  const ref = value.startsWith('ref: ') ? value.slice(5) : null;
  const commit = ref ? readRef(gitDir, ref) : (SHA.test(value) ? value.toLowerCase() : null);
  return commit ? {gitDir, commonDir: commonDirectory(gitDir), ref, commit} : null;
}

function readLooseObject(commonDir, hash){
  const file = path.join(commonDir, 'objects', hash.slice(0, 2), hash.slice(2));
  let compressed;
  try { compressed = fs.readFileSync(file); }
  catch(err){
    if(err.code === 'ENOENT') return null;
    throw err;
  }
  const data = zlib.inflateSync(compressed);
  const separator = data.indexOf(0);
  if(separator < 0) throw new Error('invalid loose Git object: ' + hash);
  return {header: data.subarray(0, separator).toString('ascii'), body: data.subarray(separator + 1)};
}

function readTree(worktree, head = readHead(worktree)){
  if(!head) return null;
  const object = readLooseObject(head.commonDir, head.commit);
  if(object){
    if(!object.header.startsWith('commit ')) throw new Error('HEAD is not a commit');
    const first = object.body.toString('utf8').split('\n', 1)[0];
    const match = /^tree ([0-9a-f]{40}(?:[0-9a-f]{24})?)$/.exec(first);
    if(!match) throw new Error('commit has no tree');
    return match[1];
  }
  // Packed objects and alternate object databases are deliberately delegated to Git.
  const result = spawnSync('git', ['rev-parse', 'HEAD^{tree}'], {
    cwd: worktree, encoding: 'utf8', maxBuffer: 1024 * 1024,
  });
  if(result.status !== 0 || !SHA.test(result.stdout.trim())){
    throw new Error('cannot resolve packed Git tree: ' + (result.stderr || '').trim());
  }
  return result.stdout.trim().toLowerCase();
}

function readSnapshot(worktree){
  const head = readHead(worktree);
  return head ? {commit: head.commit, tree: readTree(worktree, head), ref: head.ref} : null;
}

function isDirty(worktree){
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=normal'], {
    cwd: worktree, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  if(result.status !== 0) throw new Error('cannot check Git worktree status: ' + (result.stderr || '').trim());
  return result.stdout.length > 0;
}

module.exports = {gitDirectory, readHead, readTree, readSnapshot, isDirty};
