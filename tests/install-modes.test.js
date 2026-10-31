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
  fs.writeFileSync(git, '#!/bin/sh\nprintf "%s" "$2" > "$TEAOS_CAPTURE_FILE"\nmkdir -p "$3"\n');
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
