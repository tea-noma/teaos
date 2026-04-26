const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const teaos = require('../index');

test('exports getTools accessor', () => {
  const tools = teaos.getTools();
  assert.equal(typeof tools.declare, 'function');
  assert.equal(typeof tools.exec, 'function');
});

function mkTmpDir(){
  return fs.mkdtempSync(path.join(os.tmpdir(), 'teaos-test-'));
}

function writeFile(filePath, content){
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test('loads local lib package and detects extensions', () => {
  const root = mkTmpDir();
  const localRoot = path.join(root, 'lib/localpkg');

  writeFile(
    path.join(localRoot, 'index.js'),
    'module.exports = { value: "local" };\n'
  );
  writeFile(
    path.join(localRoot, 'lib/extensions/function.js'),
    'global.__local_ext_loaded = (global.__local_ext_loaded || 0) + 1;\n'
  );

  teaos.set('libpath', path.join(root, 'lib/') );
  const mod = teaos.require('@localpkg');
  assert.equal(mod.value, 'local');

  const exts = teaos.extensions('@localpkg');
  assert.equal(exts['function.js'], true);
});

test('loads npm package extensions from node_modules', () => {
  const root = mkTmpDir();
  const cwd = process.cwd();

  const npmRoot = path.join(root, 'node_modules/npkg');
  writeFile(
    path.join(npmRoot, 'package.json'),
    JSON.stringify({ name: 'npkg', version: '1.0.0', main: 'index.js' }, null, 2)
  );
  writeFile(
    path.join(npmRoot, 'index.js'),
    'module.exports = { use: () => ({ source: "npm" }) };\n'
  );
  writeFile(
    path.join(npmRoot, 'lib/extensions/function.js'),
    'global.__npm_ext_loaded = (global.__npm_ext_loaded || 0) + 1;\n'
  );

  process.chdir(root);
  teaos.set('libpath', path.join(root, 'lib/'));

  const exts = teaos.extensions('npkg');
  assert.equal(exts['function.js'], true);

  global.__npm_ext_loaded = 0;
  const inst = teaos.use('npkg', { resources: '*' });
  assert.equal(inst.source, 'npm');
  assert.equal(global.__npm_ext_loaded, 1);

  process.chdir(cwd);
});

test('loads external cli tool from local package extension with @package/tool format', () => {
  const root = mkTmpDir();
  const repoRoot = path.resolve(__dirname, '..');
  const nodeModules = path.join(root, 'node_modules');
  fs.mkdirSync(nodeModules, { recursive: true });
  fs.symlinkSync(repoRoot, path.join(nodeModules, 'teaos'), 'dir');

  const teaosBin = path.join(root, 'node_modules/teaos/bin/teaos');

  writeFile(
    path.join(root, 'lib/alpha/lib/extensions/teaos-tool/bravo.js'),
    [
      "const teaos = require('teaos');",
      'teaos.declare({',
      "  type: 'teaos-tool',",
      "  name: 'alpha/bravo',",
      '  func: (argv) => {',
      "    console.log('external-tool:' + argv[3]);",
      '  }',
      '});',
      ''
    ].join('\n')
  );

  const result = spawnSync(process.execPath, [teaosBin, '@alpha/bravo', 'ok'], {
    cwd: root,
    encoding: 'utf-8'
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /external-tool:ok/);
});

test('loads external cli tool from node_modules package extension', () => {
  const root = mkTmpDir();
  const repoRoot = path.resolve(__dirname, '..');
  const teaosRoot = path.join(root, 'node_modules/teaos');
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.symlinkSync(repoRoot, teaosRoot, 'dir');

  const teaosBin = path.join(teaosRoot, 'bin/teaos');

  writeFile(
    path.join(root, 'node_modules/npkg/lib/extensions/teaos-tool/echo.js'),
    [
      "const teaos = require('teaos');",
      'teaos.declare({',
      "  type: 'teaos-tool',",
      "  name: 'npkg/echo',",
      '  func: (argv) => {',
      "    console.log('npm-external:' + argv[3]);",
      '  }',
      '});',
      ''
    ].join('\n')
  );

  const result = spawnSync(process.execPath, [teaosBin, 'npkg/echo', 'ok'], {
    cwd: root,
    encoding: 'utf-8'
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /npm-external:ok/);
});
