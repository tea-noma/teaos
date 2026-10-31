const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const teaosBin = path.resolve(__dirname, '../bin/teaos');

function run(command, args, cwd, env){
  const result = spawnSync(command, args, {cwd, env, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function makeRemote(base, name, dependencies){
  const remote = path.join(base, 'remote', name + '.git');
  const seed = path.join(base, 'seed', name);
  fs.mkdirSync(path.dirname(remote), {recursive: true});
  fs.mkdirSync(seed, {recursive: true});
  run('git', ['init', '--bare', remote], base);
  run('git', ['init', seed], base);
  run('git', ['config', 'user.name', 'TeaOS Test'], seed);
  run('git', ['config', 'user.email', 'test@example.invalid'], seed);
  run('git', ['branch', '-M', 'master'], seed);
  fs.writeFileSync(path.join(seed, 'teaos.json'), JSON.stringify({name, dependencies}));
  run('git', ['add', 'teaos.json'], seed);
  run('git', ['commit', '-m', 'first'], seed);
  fs.writeFileSync(path.join(seed, 'index.js'), 'module.exports = {}\n');
  run('git', ['add', 'index.js'], seed);
  run('git', ['commit', '-m', 'second'], seed);
  run('git', ['remote', 'add', 'origin', remote], seed);
  run('git', ['push', '-u', 'origin', 'master'], seed);
  run('git', ['--git-dir', remote, 'symbolic-ref', 'HEAD', 'refs/heads/master'], base);
}

function setup(){
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'teaos-install-modes-'));
  const root = path.join(base, 'workspace');
  fs.mkdirSync(path.join(root, 'node_modules'), {recursive: true});
  fs.symlinkSync(path.resolve(__dirname, '..'), path.join(root, 'node_modules', 'teaos'), 'dir');
  fs.writeFileSync(path.join(root, 'teaos.json'), JSON.stringify({name: 'root', dependencies: {}}));
  makeRemote(base, 'apps.site', {'@core': '*'});
  makeRemote(base, 'teaos.core', {'@helper': '*'});
  makeRemote(base, 'teaos.helper', {});
  return {root, env: {
    ...process.env,
    TEAOS_REPO: 'file://' + path.join(base, 'remote'),
    TEAOS_REPO_PREFIX: 'teaos.',
    APPS_REPO_PREFIX: 'apps.',
  }};
}

test('files mode fetches an app and its transitive libraries without Git metadata', () => {
  const {root, env} = setup();
  run(process.execPath, [teaosBin, 'install', 'apps/site', '--mode=files'], root, env);
  for(const relative of ['apps/site', 'lib/core', 'lib/helper']){
    const target = path.join(root, relative);
    assert.equal(fs.existsSync(path.join(target, 'teaos.json')), true);
    assert.equal(fs.existsSync(path.join(target, 'index.js')), true);
    assert.equal(fs.existsSync(path.join(target, '.git')), false);
  }
});

test('shallow mode keeps Git information with only the latest commit', () => {
  const {root, env} = setup();
  run(process.execPath, [teaosBin, 'install', '--mode', 'shallow', 'apps/site'], root, env);
  for(const relative of ['apps/site', 'lib/core', 'lib/helper']){
    const target = path.join(root, relative);
    assert.equal(fs.existsSync(path.join(target, '.git')), true);
    assert.equal(fs.existsSync(path.join(target, '.git/shallow')), true);
    assert.equal(run('git', ['rev-list', '--count', 'HEAD'], target).trim(), '1');
  }
});

test('default mode retains full repository history', () => {
  const {root, env} = setup();
  run(process.execPath, [teaosBin, 'install', 'apps/site'], root, env);
  assert.equal(run('git', ['rev-list', '--count', 'HEAD'], path.join(root, 'apps/site')).trim(), '2');
  assert.equal(run('git', ['rev-list', '--count', 'HEAD'], path.join(root, 'lib/helper')).trim(), '2');
});

test('without apps directory the root teaos.json is the single application', () => {
  const {root, env} = setup();
  fs.writeFileSync(path.join(root, 'teaos.json'), JSON.stringify({
    name: 'site', dependencies: {'@core': '*'},
  }));
  run(process.execPath, [teaosBin, 'install'], root, env);
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'teaos-lock.json'), 'utf8'));
  assert.deepEqual(Object.keys(lock.packages).sort(), ['@core', '@helper']);
  assert.equal(fs.existsSync(path.join(root, 'apps')), false);
});

test('root install in multi-app layout validates apps without sequentially resolving their npm dependencies', () => {
  const {root, env} = setup();
  const first = path.join(root, 'apps/first');
  const second = path.join(root, 'apps/second');
  fs.mkdirSync(first, {recursive: true});
  fs.mkdirSync(second, {recursive: true});
  fs.writeFileSync(path.join(first, 'teaos.json'), JSON.stringify({name: 'first', dependencies: {'@core': '*'}}));
  fs.writeFileSync(path.join(second, 'teaos.json'), JSON.stringify({name: 'second', dependencies: {'@helper': '*'}}));
  run(process.execPath, [teaosBin, 'install'], root, env);
  assert.equal(fs.existsSync(path.join(first, 'teaos-lock.json')), false);
  assert.equal(fs.existsSync(path.join(second, 'teaos-lock.json')), false);
  run(process.execPath, [teaosBin, 'install'], first, env);
  run(process.execPath, [teaosBin, 'install'], second, env);
  assert.equal(fs.existsSync(path.join(first, 'teaos-lock.json')), true);
  assert.equal(fs.existsSync(path.join(second, 'teaos-lock.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'lib/core/teaos.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'lib/helper/teaos.json')), true);
});

test('apps directory with no valid app definition fails, but an explicit app install can bootstrap it', () => {
  const {root, env} = setup();
  fs.mkdirSync(path.join(root, 'apps'));
  const invalid = spawnSync(process.execPath, [teaosBin, 'install'], {cwd: root, env, encoding: 'utf8'});
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /apps exists but contains no valid app teaos.json/);
  run(process.execPath, [teaosBin, 'install', 'apps/site'], root, env);
  assert.equal(fs.existsSync(path.join(root, 'apps/site/teaos-lock.json')), true);
});

test('malformed app definitions do not make an apps directory valid', () => {
  const {root, env} = setup();
  const app = path.join(root, 'apps/broken');
  fs.mkdirSync(app, {recursive: true});
  fs.writeFileSync(path.join(app, 'teaos.json'), '{not json');
  const result = spawnSync(process.execPath, [teaosBin, 'install'], {cwd: root, env, encoding: 'utf8'});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /apps exists but contains no valid app teaos.json/);
});

test('multi-app root requires an explicit app for remote-lock updates', () => {
  const {root, env} = setup();
  const app = path.join(root, 'apps/first');
  fs.mkdirSync(app, {recursive: true});
  fs.writeFileSync(path.join(app, 'teaos.json'), JSON.stringify({name: 'first', dependencies: {}}));
  const result = spawnSync(process.execPath, [teaosBin, 'install', '--lock-source=remote'],
    {cwd: root, env, encoding: 'utf8'});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires a single root app or apps\/APPNAME/);
});

test('single root application can use its published remote lock', () => {
  const {root, env} = setup();
  fs.writeFileSync(path.join(root, 'teaos.json'), JSON.stringify({
    name: 'site', dependencies: {'@core': '*'},
  }));
  run(process.execPath, [teaosBin, 'install'], root, env);
  const appSeed = path.join(path.dirname(root), 'seed/apps.site');
  fs.copyFileSync(path.join(root, 'teaos-lock.json'), path.join(appSeed, 'teaos-lock.json'));
  run('git', ['add', 'teaos-lock.json'], appSeed);
  run('git', ['commit', '-m', 'publish root lock'], appSeed);
  run('git', ['push', 'origin', 'master'], appSeed);
  run(process.execPath, [teaosBin, 'install', '--lock-source=remote'], root, env);
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'teaos-lock.json'), 'utf8'));
  assert.match(lock.upstream.commit, /^[0-9a-f]{40}$/);
});

test('an already checked-out app still resolves its library dependencies', () => {
  const {root, env} = setup();
  const app = path.join(root, 'apps/site');
  fs.mkdirSync(app, {recursive: true});
  fs.writeFileSync(path.join(app, 'teaos.json'), JSON.stringify({
    name: 'site', dependencies: {'@core': '*'},
  }));
  run(process.execPath, [teaosBin, 'install', 'apps/site', '--mode=files'], root, env);
  assert.equal(fs.existsSync(path.join(root, 'lib/core/teaos.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'lib/helper/teaos.json')), true);
  assert.equal(fs.existsSync(path.join(app, '.git')), false);
});

test('application-to-application dependencies are rejected', () => {
  const {root, env} = setup();
  fs.writeFileSync(path.join(root, 'teaos.json'), JSON.stringify({
    name: 'root', dependencies: {'apps/another': '*'},
  }));
  const result = spawnSync(process.execPath, [teaosBin, 'install'], {cwd: root, env, encoding: 'utf8'});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /application dependencies are not supported/);
});

test('dependency inspection leaves an existing teaos.json byte-for-byte unchanged', () => {
  const {root, env} = setup();
  const config = path.join(root, 'teaos.json');
  const original = '{\n  "name": "root",\n  "dependencies": {}\n}\n';
  fs.writeFileSync(config, original);
  run(process.execPath, [teaosBin, 'install'], root, env);
  assert.equal(fs.readFileSync(config, 'utf8'), original);
});

test('--git-url overrides the environment base for apps and transitive libraries', () => {
  const {root, env} = setup();
  env.TEAOS_REPO = 'file:///nonexistent/teaos-repositories';
  const base = path.dirname(root);
  run(process.execPath, [teaosBin, 'install', 'apps/site', '--git-url',
    'file://' + path.join(base, 'remote')], root, env);
  assert.equal(fs.existsSync(path.join(root, 'apps/site/teaos.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'lib/core/teaos.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'lib/helper/teaos.json')), true);
});

function captureCloneRemote(args, overrides = {}, target = 'lib/core'){
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'teaos-install-remote-'));
  const root = path.join(base, 'workspace');
  const bin = path.join(base, 'bin');
  const capture = path.join(base, 'remote.txt');
  fs.mkdirSync(path.join(root, 'node_modules'), {recursive: true});
  fs.mkdirSync(bin);
  fs.symlinkSync(path.resolve(__dirname, '..'), path.join(root, 'node_modules', 'teaos'), 'dir');
  fs.writeFileSync(path.join(root, 'teaos.json'), JSON.stringify({name: 'root', dependencies: {}}));
  const git = path.join(bin, 'git');
  fs.writeFileSync(git, '#!/bin/sh\nprintf "%s" "$2" > "$TEAOS_CAPTURE_FILE"\nmkdir -p "$3"\nprintf \'{"name":"capture","dependencies":{}}\' > "$3/teaos.json"\n');
  fs.chmodSync(git, 0o755);
  const env = {...process.env, ...overrides,
    PATH: bin + path.delimiter + process.env.PATH,
    TEAOS_CAPTURE_FILE: capture,
  };
  delete env.TEAOS_REPO;
  delete env.TEAOS_USER;
  Object.assign(env, overrides);
  run(process.execPath, [teaosBin, 'install', target, ...args], root, env);
  return fs.existsSync(capture) ? fs.readFileSync(capture, 'utf8') : null;
}

test('repository is not fetched without an explicit CLI or environment setting', () => {
  assert.equal(captureCloneRemote([]), null);
  assert.equal(captureCloneRemote([], {}, 'apps/site'), null);
});

test('an unresolved library does not produce an incomplete lockfile', () => {
  const {root, env} = setup();
  delete env.TEAOS_REPO;
  fs.writeFileSync(path.join(root, 'teaos.json'), JSON.stringify({
    name: 'root', dependencies: {'@missing': '*'},
  }));
  run(process.execPath, [teaosBin, 'install'], root, env);
  assert.equal(fs.existsSync(path.join(root, 'teaos-lock.json')), false);
});

test('GitHub account can be selected from CLI or environment', () => {
  assert.equal(captureCloneRemote([], {TEAOS_USER: 'another-owner'}),
    'https://github.com/another-owner/core.git');
  assert.equal(captureCloneRemote(['--user=cli-owner'], {
    TEAOS_REPO: 'https://example.invalid/env-owner',
  }), 'https://github.com/cli-owner/core.git');
  assert.equal(captureCloneRemote(['--user', 'ignored-owner', '--git-url',
    'https://git.example.org/actual-owner/'], {TEAOS_REPO: 'https://example.invalid/env-owner'}),
  'https://git.example.org/actual-owner/core.git');
});

test('app lock records transitive repository revisions and restores the pinned commits', () => {
  const {root, env} = setup();
  run(process.execPath, [teaosBin, 'install', 'apps/site'], root, env);
  const app = path.join(root, 'apps/site');
  const lock = JSON.parse(fs.readFileSync(path.join(app, 'teaos-lock.json'), 'utf8'));
  assert.equal(lock.lockfileVersion, 1);
  assert.deepEqual(Object.keys(lock.packages).sort(), ['@core', '@helper']);
  assert.match(lock.packages['@core'].commit, /^[0-9a-f]{40}$/);
  assert.match(lock.packages['@core'].tree, /^[0-9a-f]{40}$/);

  const seed = path.join(path.dirname(root), 'seed/teaos.core');
  fs.writeFileSync(path.join(seed, 'index.js'), 'module.exports = {newer: true}\n');
  run('git', ['add', 'index.js'], seed);
  run('git', ['commit', '-m', 'newer'], seed);
  run('git', ['push', 'origin', 'master'], seed);
  assert.notEqual(run('git', ['rev-parse', 'HEAD'], seed).trim(), lock.packages['@core'].commit);

  fs.rmSync(path.join(root, 'lib/core'), {recursive: true});
  run(process.execPath, [teaosBin, 'install'], app, env);
  assert.equal(run('git', ['rev-parse', 'HEAD'], path.join(root, 'lib/core')).trim(),
    lock.packages['@core'].commit);
  assert.equal(run('git', ['rev-parse', 'HEAD^{tree}'], path.join(root, 'lib/core')).trim(),
    lock.packages['@core'].tree);
});

test('files-only lock detects local edits without Git metadata', () => {
  const {root, env} = setup();
  run(process.execPath, [teaosBin, 'install', 'apps/site', '--mode=files'], root, env);
  const app = path.join(root, 'apps/site');
  const lock = JSON.parse(fs.readFileSync(path.join(app, 'teaos-lock.json'), 'utf8'));
  assert.match(lock.packages['@core'].contentHash, /^[0-9a-f]{64}$/);
  fs.writeFileSync(path.join(root, 'lib/core/index.js'), 'local edit\n');
  const result = spawnSync(process.execPath, [teaosBin, 'install'], {cwd: app, env, encoding: 'utf8'});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /local files differ from teaos-lock.json/);
  assert.equal(fs.readFileSync(path.join(root, 'lib/core/index.js'), 'utf8'), 'local edit\n');
});

test('locked Git checkout rejects local edits without overwriting them', () => {
  const {root, env} = setup();
  run(process.execPath, [teaosBin, 'install', 'apps/site'], root, env);
  const app = path.join(root, 'apps/site');
  const source = path.join(root, 'lib/core/index.js');
  fs.writeFileSync(source, 'local edit\n');
  const result = spawnSync(process.execPath, [teaosBin, 'install'], {cwd: app, env, encoding: 'utf8'});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /local repository differs from teaos-lock.json/);
  assert.equal(fs.readFileSync(source, 'utf8'), 'local edit\n');
});

test('a Git lock can materialize the pinned revision in files-only mode', () => {
  const {root, env} = setup();
  run(process.execPath, [teaosBin, 'install', 'apps/site'], root, env);
  const app = path.join(root, 'apps/site');
  const lockPath = path.join(app, 'teaos-lock.json');
  const oldLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assert.equal(oldLock.packages['@core'].contentHash, undefined);
  const seed = path.join(path.dirname(root), 'seed/teaos.core');
  fs.writeFileSync(path.join(seed, 'index.js'), 'module.exports = {newer: true}\n');
  run('git', ['add', 'index.js'], seed);
  run('git', ['commit', '-m', 'newer'], seed);
  run('git', ['push', 'origin', 'master'], seed);
  fs.rmSync(path.join(root, 'lib/core'), {recursive: true});
  run(process.execPath, [teaosBin, 'install', '--mode=files'], app, env);
  const core = path.join(root, 'lib/core');
  assert.equal(fs.existsSync(path.join(core, '.git')), false);
  assert.equal(fs.readFileSync(path.join(core, 'index.js'), 'utf8'), 'module.exports = {}\n');
  const updatedLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assert.equal(updatedLock.packages['@core'].commit, oldLock.packages['@core'].commit);
  assert.match(updatedLock.packages['@core'].contentHash, /^[0-9a-f]{64}$/);
});

test('dirty or unpushed existing library is left untouched and not locked', () => {
  const {root, env} = setup();
  fs.writeFileSync(path.join(root, 'teaos.json'), JSON.stringify({name: 'root', dependencies: {'@core': '*'}}));
  const remote = path.join(path.dirname(root), 'remote/teaos.core.git');
  const lib = path.join(root, 'lib/core');
  fs.mkdirSync(path.dirname(lib), {recursive: true});
  run('git', ['clone', remote, lib], root);
  fs.writeFileSync(path.join(lib, 'index.js'), 'uncommitted\n');
  run(process.execPath, [teaosBin, 'install'], root, env);
  assert.equal(fs.existsSync(path.join(root, 'teaos-lock.json')), false);
  assert.equal(fs.readFileSync(path.join(lib, 'index.js'), 'utf8'), 'uncommitted\n');
  run('git', ['config', 'user.name', 'TeaOS Test'], lib);
  run('git', ['config', 'user.email', 'test@example.invalid'], lib);
  run('git', ['add', 'index.js'], lib);
  run('git', ['commit', '-m', 'local only'], lib);
  run(process.execPath, [teaosBin, 'install'], root, env);
  assert.equal(fs.existsSync(path.join(root, 'teaos-lock.json')), false);
});

test('an existing lock rejects unrecorded dependency edits but named install updates it', () => {
  const {root, env} = setup();
  run(process.execPath, [teaosBin, 'install', 'apps/site'], root, env);
  const app = path.join(root, 'apps/site');
  const configPath = path.join(app, 'teaos.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.dependencies['@helper'] = '*';
  fs.writeFileSync(configPath, JSON.stringify(config));
  const rejected = spawnSync(process.execPath, [teaosBin, 'install'], {cwd: app, env, encoding: 'utf8'});
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /teaos.json dependencies differ/);
  run(process.execPath, [teaosBin, 'install', '@helper'], app, env);
  const lock = JSON.parse(fs.readFileSync(path.join(app, 'teaos-lock.json'), 'utf8'));
  assert.equal(lock.dependencies['@helper'], '*');
});

function publishUpdatedAppLock(root){
  const base = path.dirname(root);
  const app = path.join(root, 'apps/site');
  const coreSeed = path.join(base, 'seed/teaos.core');
  fs.writeFileSync(path.join(coreSeed, 'index.js'), 'module.exports = {version: 3}\n');
  run('git', ['add', 'index.js'], coreSeed);
  run('git', ['commit', '-m', 'new core'], coreSeed);
  run('git', ['push', 'origin', 'master'], coreSeed);
  const lock = JSON.parse(fs.readFileSync(path.join(app, 'teaos-lock.json'), 'utf8'));
  lock.packages['@core'].commit = run('git', ['rev-parse', 'HEAD'], coreSeed).trim();
  lock.packages['@core'].tree = run('git', ['rev-parse', 'HEAD^{tree}'], coreSeed).trim();
  delete lock.packages['@core'].contentHash;
  const appSeed = path.join(base, 'seed/apps.site');
  fs.writeFileSync(path.join(appSeed, 'teaos-lock.json'), JSON.stringify(lock, null, 2) + '\n');
  run('git', ['add', 'teaos-lock.json'], appSeed);
  run('git', ['commit', '-m', 'update dependency lock'], appSeed);
  run('git', ['push', 'origin', 'master'], appSeed);
  return lock;
}

test('remote lock mode updates only changed libraries and preserves previous checkout', () => {
  const {root, env} = setup();
  run(process.execPath, [teaosBin, 'install', 'apps/site'], root, env);
  const app = path.join(root, 'apps/site');
  const helper = path.join(root, 'lib/helper');
  const helperHead = run('git', ['rev-parse', 'HEAD'], helper).trim();
  const published = publishUpdatedAppLock(root);
  run(process.execPath, [teaosBin, 'install', '--lock-source=remote'], app, env);
  assert.equal(run('git', ['rev-parse', 'HEAD'], path.join(root, 'lib/core')).trim(),
    published.packages['@core'].commit);
  assert.equal(run('git', ['rev-parse', 'HEAD'], helper).trim(), helperHead);
  const lock = JSON.parse(fs.readFileSync(path.join(app, 'teaos-lock.json'), 'utf8'));
  assert.equal(lock.packages['@core'].commit, published.packages['@core'].commit);
  assert.match(lock.upstream.commit, /^[0-9a-f]{40}$/);
  assert.match(lock.upstream.lockIdentity, /^[0-9a-f]{64}$/);
  const backups = fs.readdirSync(path.join(root, 'lib')).filter(name => name.startsWith('.teaos-stage-'));
  assert.equal(backups.length, 1);
  assert.equal(fs.existsSync(path.join(root, 'lib', backups[0], '.previous-core/index.js')), true);
  run(process.execPath, [teaosBin, 'install', '--lock-source=remote'], app, env);
  assert.deepEqual(fs.readdirSync(path.join(root, 'lib')).filter(name => name.startsWith('.teaos-stage-')), backups);
});

test('remote lock mode updates a files-only deployment without changing unchanged libraries', () => {
  const {root, env} = setup();
  run(process.execPath, [teaosBin, 'install', 'apps/site', '--mode=files'], root, env);
  const app = path.join(root, 'apps/site');
  const helper = path.join(root, 'lib/helper/index.js');
  const helperBefore = fs.readFileSync(helper, 'utf8');
  const published = publishUpdatedAppLock(root);
  run(process.execPath, [teaosBin, 'install', '--lock-source=remote', '--mode=files'], app, env);
  assert.equal(fs.readFileSync(path.join(root, 'lib/core/index.js'), 'utf8'),
    'module.exports = {version: 3}\n');
  assert.equal(fs.existsSync(path.join(root, 'lib/core/.git')), false);
  assert.equal(fs.readFileSync(helper, 'utf8'), helperBefore);
  const lock = JSON.parse(fs.readFileSync(path.join(app, 'teaos-lock.json'), 'utf8'));
  assert.equal(lock.packages['@core'].commit, published.packages['@core'].commit);
  assert.match(lock.packages['@core'].contentHash, /^[0-9a-f]{64}$/);
});

test('remote lock mode fails clearly when the app repository has no published lock', () => {
  const {root, env} = setup();
  run(process.execPath, [teaosBin, 'install', 'apps/site'], root, env);
  const app = path.join(root, 'apps/site');
  const before = fs.readFileSync(path.join(app, 'teaos-lock.json'), 'utf8');
  const result = spawnSync(process.execPath, [teaosBin, 'install', '--lock-source=remote'],
    {cwd: app, env, encoding: 'utf8'});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /remote app has no teaos-lock.json/);
  assert.equal(fs.readFileSync(path.join(app, 'teaos-lock.json'), 'utf8'), before);
});

test('remote lock mode rejects a modified library before updating the local lock', () => {
  const {root, env} = setup();
  run(process.execPath, [teaosBin, 'install', 'apps/site'], root, env);
  const app = path.join(root, 'apps/site');
  const oldLock = fs.readFileSync(path.join(app, 'teaos-lock.json'), 'utf8');
  publishUpdatedAppLock(root);
  fs.writeFileSync(path.join(root, 'lib/core/index.js'), 'local edit\n');
  const result = spawnSync(process.execPath, [teaosBin, 'install', '--lock-source=remote'],
    {cwd: app, env, encoding: 'utf8'});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /local repository differs from teaos-lock.json/);
  assert.equal(fs.readFileSync(path.join(app, 'teaos-lock.json'), 'utf8'), oldLock);
  assert.equal(fs.readFileSync(path.join(root, 'lib/core/index.js'), 'utf8'), 'local edit\n');
});
