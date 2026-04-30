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

test('teaos.attr returns project attributes', () => {
  const root = mkTmpDir();
  const main = require.main;
  const prevMainFilename = main && main.filename;
  if(main){
    main.filename = path.join(root, 'entry.js');
  }

  assert.equal(teaos.attr('root'), root);
  assert.equal(teaos.attr('name'), path.basename(root));

  writeFile(path.join(root, 'teaos.json'), JSON.stringify({ name: 'teaos-name' }));
  assert.equal(teaos.attr('name'), 'teaos-name');

  writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'pkg-name' }));
  assert.equal(teaos.attr('name'), 'pkg-name');

  assert.equal(teaos.attr('path.@apps'), null);
  assert.equal(teaos.attr('path.apps'), null);
  writeFile(path.join(root, 'apps/.keep'), '');
  assert.equal(teaos.attr('path.@apps'), './apps');
  assert.equal(teaos.attr('path.apps'), path.join(root, 'apps'));

  assert.equal(teaos.attr('path.@lib'), './lib');
  fs.rmSync(path.resolve(root, '../lib'), { recursive: true, force: true });
  assert.equal(teaos.attr('path.lib'), null);
  writeFile(path.resolve(root, '../lib/.keep'), '');
  assert.equal(teaos.attr('path.lib'), path.resolve(root, '../lib'));

  assert.equal(teaos.attr('path.@tests'), './tests');
  fs.rmSync(path.resolve(root, '../tests'), { recursive: true, force: true });
  assert.equal(teaos.attr('path.tests'), null);
  writeFile(path.resolve(root, '../tests/.keep'), '');
  assert.equal(teaos.attr('path.tests'), path.resolve(root, '../tests'));

  assert.equal(teaos.attr('unknown'), null);
  if(main){
    main.filename = prevMainFilename;
  }
});

test('supports ls/extension-types/extensions teaos tools', () => {
  const root = mkTmpDir();
  const repoRoot = path.resolve(__dirname, '..');
  const teaosRoot = path.join(root, 'node_modules/teaos');
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.symlinkSync(repoRoot, teaosRoot, 'dir');
  const teaosBin = path.join(teaosRoot, 'bin/teaos');

  writeFile(path.join(root, 'lib/a/index.js'), 'module.exports = {};\n');
  writeFile(path.join(root, 'lib/b/index.js'), 'module.exports = {};\n');
  writeFile(path.join(root, 'apps/alpha/.keep'), '');
  writeFile(path.join(root, 'apps/bravo/.keep'), '');
  writeFile(path.join(root, 'lib/a/lib/extensions/http/get/.keep'), '');
  writeFile(path.join(root, 'lib/a/lib/extensions/http/post/.keep'), '');
  writeFile(path.join(root, 'lib/b/lib/extensions/ws/connect/.keep'), '');

  const lsLib = spawnSync(process.execPath, [teaosBin, 'ls', 'lib'], { cwd: root, encoding: 'utf-8' });
  assert.equal(lsLib.status, 0);
  assert.match(lsLib.stdout, /a/);

  const lsApps = spawnSync(process.execPath, [teaosBin, 'ls', 'apps'], { cwd: root, encoding: 'utf-8' });
  assert.equal(lsApps.status, 0);
  assert.match(lsApps.stdout, /alpha/);

  const extTypes = spawnSync(process.execPath, [teaosBin, 'extension-types'], { cwd: root, encoding: 'utf-8' });
  assert.equal(extTypes.status, 0);
  assert.match(extTypes.stdout, /http/);
  assert.match(extTypes.stdout, /ws/);

  const lsByType = spawnSync(process.execPath, [teaosBin, 'ls', '--extension-type', 'http'], { cwd: root, encoding: 'utf-8' });
  assert.equal(lsByType.status, 0);
  assert.match(lsByType.stdout, /a/);

  const extAll = spawnSync(process.execPath, [teaosBin, 'extensions', '--all'], { cwd: root, encoding: 'utf-8' });
  assert.equal(extAll.status, 0);
  assert.match(extAll.stdout, /a.http/);

  const extByType = spawnSync(process.execPath, [teaosBin, 'extensions', '--type', 'ws'], { cwd: root, encoding: 'utf-8' });
  assert.equal(extByType.status, 0);
  assert.match(extByType.stdout, /b/);

  const extByPkg = spawnSync(process.execPath, [teaosBin, 'extensions', '--package', 'a'], { cwd: root, encoding: 'utf-8' });
  assert.equal(extByPkg.status, 0);
  assert.match(extByPkg.stdout, /http/);

  const attrLib = spawnSync(process.execPath, [teaosBin, 'attr', 'path.@lib'], { cwd: root, encoding: 'utf-8' });
  assert.equal(attrLib.status, 0);
  assert.match(attrLib.stdout, /\.\/lib/);
});
