const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const gitLocal = require('../lib/objects/git-local');

function git(cwd, ...args){
  const result = spawnSync('git', args, {cwd, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function repository(){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teaos-git-local-'));
  git(dir, 'init');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'user.email', 'test@example.invalid');
  fs.writeFileSync(path.join(dir, 'file.txt'), 'first\n');
  git(dir, 'add', 'file.txt');
  git(dir, 'commit', '-m', 'first');
  return dir;
}

test('loose HEAD and commit tree are read without invoking Git', () => {
  const dir = repository();
  const expected = {commit: git(dir, 'rev-parse', 'HEAD'), tree: git(dir, 'rev-parse', 'HEAD^{tree}')};
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = '';
    const snapshot = gitLocal.readSnapshot(dir);
    assert.equal(snapshot.commit, expected.commit);
    assert.equal(snapshot.tree, expected.tree);
    assert.match(snapshot.ref, /^refs\/heads\//);
  } finally { process.env.PATH = originalPath; }
});

test('detached HEAD and linked worktree .git file are supported', () => {
  const dir = repository();
  const linked = path.join(path.dirname(dir), path.basename(dir) + '-linked');
  git(dir, 'worktree', 'add', '--detach', linked);
  const snapshot = gitLocal.readSnapshot(linked);
  assert.equal(snapshot.commit, git(dir, 'rev-parse', 'HEAD'));
  assert.equal(snapshot.tree, git(dir, 'rev-parse', 'HEAD^{tree}'));
  assert.equal(snapshot.ref, null);
});

test('packed refs and packed commit objects resolve safely', () => {
  const dir = repository();
  const branch = git(dir, 'symbolic-ref', 'HEAD');
  git(dir, 'pack-refs', '--all', '--prune');
  assert.equal(fs.existsSync(path.join(dir, '.git', branch)), false);
  assert.equal(gitLocal.readHead(dir).commit, git(dir, 'rev-parse', 'HEAD'));
  git(dir, 'gc', '--prune=now');
  assert.equal(gitLocal.readSnapshot(dir).tree, git(dir, 'rev-parse', 'HEAD^{tree}'));
});

test('dirty worktree is not inferred from unchanged HEAD', () => {
  const dir = repository();
  const snapshot = gitLocal.readSnapshot(dir);
  assert.equal(gitLocal.isDirty(dir), false);
  fs.writeFileSync(path.join(dir, 'file.txt'), 'edited\n');
  assert.deepEqual(gitLocal.readSnapshot(dir), snapshot);
  assert.equal(gitLocal.isDirty(dir), true);
});
