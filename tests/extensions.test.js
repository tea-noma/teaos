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


function writeExecutable(filePath, content){
  writeFile(filePath, content);
  fs.chmodSync(filePath, 0o755);
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

test('supports create app/lib commands', () => {
  const root = mkTmpDir();
  const repoRoot = path.resolve(__dirname, '..');
  const teaosRoot = path.join(root, 'node_modules/teaos');
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.symlinkSync(repoRoot, teaosRoot, 'dir');
  const teaosBin = path.join(teaosRoot, 'bin/teaos');

  const createApp = spawnSync(process.execPath, [teaosBin, 'create', 'app', 'api'], { cwd: root, encoding: 'utf-8' });
  assert.equal(createApp.status, 0);
  assert.equal(fs.existsSync(path.join(root, 'apps/api/teaos.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'apps/api/index.js')), true);

  const createLib = spawnSync(process.execPath, [teaosBin, 'create', 'lib', 'core'], { cwd: root, encoding: 'utf-8' });
  assert.equal(createLib.status, 0);
  assert.equal(fs.existsSync(path.join(root, 'lib/core/teaos.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'lib/core/index.js')), true);

  const libConfig = JSON.parse(fs.readFileSync(path.join(root, 'lib/core/teaos.json'), 'utf8'));
  assert.equal(libConfig.name, '@core');
});

test('supports install/uninstall lib/<name> aliases', () => {
  const root = mkTmpDir();
  const repoRoot = path.resolve(__dirname, '..');
  const teaosRoot = path.join(root, 'node_modules/teaos');
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.symlinkSync(repoRoot, teaosRoot, 'dir');
  const teaosBin = path.join(teaosRoot, 'bin/teaos');

  writeFile(path.join(root, 'teaos.json'), JSON.stringify({ name: 'root', dependencies: {} }, null, 2));

  const installAlias = spawnSync(process.execPath, [teaosBin, 'install', 'lib/core'], { cwd: root, encoding: 'utf-8' });
  assert.equal(installAlias.status, 0);
  const installed = JSON.parse(fs.readFileSync(path.join(root, 'teaos.json'), 'utf8'));
  assert.equal(installed.dependencies['@core'], '*');

  const uninstallAlias = spawnSync(process.execPath, [teaosBin, 'uninstall', 'lib/core'], { cwd: root, encoding: 'utf-8' });
  assert.equal(uninstallAlias.status, 0);
  const uninstalled = JSON.parse(fs.readFileSync(path.join(root, 'teaos.json'), 'utf8'));
  assert.equal(uninstalled.dependencies['@core'], undefined);
});

test('supports install apps/<name> with APPS_REPO_PREFIX', () => {
  const base = mkTmpDir();
  const root = path.join(base, 'workspace');
  const remoteBase = path.join(base, 'remote');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(remoteBase, { recursive: true });
  const repoRoot = path.resolve(__dirname, '..');
  const teaosRoot = path.join(root, 'node_modules/teaos');
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.symlinkSync(repoRoot, teaosRoot, 'dir');
  const teaosBin = path.join(teaosRoot, 'bin/teaos');

  writeFile(path.join(root, 'teaos.json'), JSON.stringify({ name: 'root', dependencies: {} }, null, 2));

  const remoteApp = path.join(remoteBase, 'app-sample.git');
  spawnSync('git', ['init', '--bare', remoteApp], { encoding: 'utf-8' });

  const installApp = spawnSync(process.execPath, [teaosBin, 'install', 'apps/sample'], {
    cwd: root,
    encoding: 'utf-8',
    env: {
      ...process.env,
      TEAOS_REPO: 'file://' + remoteBase,
      APPS_REPO_PREFIX: 'app-'
    }
  });
  assert.equal(installApp.status, 0);
  assert.equal(fs.existsSync(path.join(root, 'apps/sample/.git')), true);
});

test('supports install command for app/lib scopes and dependency syncing', () => {
  const root = mkTmpDir();
  const repoRoot = path.resolve(__dirname, '..');
  const teaosRoot = path.join(root, 'node_modules/teaos');
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.symlinkSync(repoRoot, teaosRoot, 'dir');
  const teaosBin = path.join(teaosRoot, 'bin/teaos');

  writeFile(path.join(root, 'teaos.json'), JSON.stringify({ name: 'root', dependencies: {} }, null, 2));
  writeFile(path.join(root, 'apps/app1/teaos.json'), JSON.stringify({ name: 'app1', dependencies: {} }, null, 2));
  writeFile(path.join(root, 'lib/lib1/teaos.json'), JSON.stringify({ name: '@lib1', dependencies: {} }, null, 2));

  const fakeBin = path.join(root, 'fake-bin');
  writeExecutable(path.join(fakeBin, 'npm'), '#!/usr/bin/env node\nprocess.exit(0);\n');
  writeExecutable(path.join(fakeBin, 'git'), '#!/usr/bin/env node\nprocess.exit(0);\n');

  const appInstall = spawnSync(process.execPath, [teaosBin, 'install', '@libX'], {
    cwd: path.join(root, 'apps/app1'),
    encoding: 'utf-8',
    env: { ...process.env, PATH: fakeBin + path.delimiter + process.env.PATH }
  });
  assert.equal(appInstall.status, 0);

  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'apps/app1/teaos.json'), 'utf8'));
  const rootConfig = JSON.parse(fs.readFileSync(path.join(root, 'teaos.json'), 'utf8'));
  assert.equal(appConfig.dependencies['@libX'], '*');
  assert.equal(rootConfig.dependencies['@libX'], '*');

  const libInstall = spawnSync(process.execPath, [teaosBin, 'install', '@libY'], {
    cwd: path.join(root, 'lib/lib1'),
    encoding: 'utf-8',
    env: { ...process.env, PATH: fakeBin + path.delimiter + process.env.PATH }
  });
  assert.equal(libInstall.status, 0);

  const libConfig = JSON.parse(fs.readFileSync(path.join(root, 'lib/lib1/teaos.json'), 'utf8'));
  assert.equal(libConfig.dependencies['@libY'], '*');
});


test('install loads .env and resolves tea/npm dependencies recursively', () => {
  const root = mkTmpDir();
  const repoRoot = path.resolve(__dirname, '..');
  const teaosRoot = path.join(root, 'node_modules/teaos');
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.symlinkSync(repoRoot, teaosRoot, 'dir');
  const teaosBin = path.join(teaosRoot, 'bin/teaos');

  writeFile(path.join(root, 'teaos.json'), JSON.stringify({ name: 'root', dependencies: { '@core': '*', lodash: '*' } }, null, 2));
  writeFile(path.join(root, '.env'), 'TEAOS_REPO=https://token.github.com/tea-noma\nTEAOS_REPO_PREFIX=team-\n');

  const fakeBin = path.join(root, 'fake-bin');
  writeExecutable(path.join(fakeBin, 'npm'), "#!/usr/bin/env node\nconst fs=require('fs');const path=require('path');const cwd=process.cwd();const m=process.argv[3];if(m){fs.mkdirSync(path.join(cwd,'node_modules',m),{recursive:true});}process.exit(0);\n");
  writeExecutable(path.join(fakeBin, 'git'), "#!/usr/bin/env node\nconst fs=require('fs');const path=require('path');const target=process.argv[4];const remote=process.argv[3];fs.mkdirSync(target,{recursive:true});const name='@'+path.basename(target);fs.writeFileSync(path.join(target,'teaos.json'),JSON.stringify({name,dependencies:{chalk:'*'}},null,2));fs.writeFileSync(path.join(process.cwd(),'git-remote.txt'),remote);process.exit(0);\n");

  const result = spawnSync(process.execPath, [teaosBin, 'install'], {
    cwd: root,
    encoding: 'utf-8',
    env: { ...process.env, PATH: fakeBin + path.delimiter + process.env.PATH }
  });
  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(path.join(root, 'lib/core/teaos.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'node_modules/lodash')), true);
  assert.equal(fs.existsSync(path.join(root, 'node_modules/chalk')), true);

  assert.equal(fs.readFileSync(path.join(root, 'git-remote.txt'), 'utf8'), 'https://token.github.com/tea-noma/team-core.git');
});


test('supports uninstall command for app/lib scopes without removing lib directory', () => {
  const root = mkTmpDir();
  const repoRoot = path.resolve(__dirname, '..');
  const teaosRoot = path.join(root, 'node_modules/teaos');
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.symlinkSync(repoRoot, teaosRoot, 'dir');
  const teaosBin = path.join(teaosRoot, 'bin/teaos');

  writeFile(path.join(root, 'teaos.json'), JSON.stringify({ name: 'root', dependencies: { '@libX': '*', lodash: '*' } }, null, 2));
  writeFile(path.join(root, 'apps/app1/teaos.json'), JSON.stringify({ name: 'app1', dependencies: { '@libX': '*', lodash: '*' } }, null, 2));
  writeFile(path.join(root, 'lib/lib1/teaos.json'), JSON.stringify({ name: '@lib1', dependencies: { '@libY': '*' } }, null, 2));
  writeFile(path.join(root, 'lib/libX/index.js'), 'module.exports = {};\n');

  const appUninstall = spawnSync(process.execPath, [teaosBin, 'uninstall', '@libX'], { cwd: path.join(root, 'apps/app1'), encoding: 'utf-8' });
  assert.equal(appUninstall.status, 0);

  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'apps/app1/teaos.json'), 'utf8'));
  const rootConfig = JSON.parse(fs.readFileSync(path.join(root, 'teaos.json'), 'utf8'));
  assert.equal(appConfig.dependencies['@libX'], undefined);
  assert.equal(rootConfig.dependencies['@libX'], undefined);
  assert.equal(fs.existsSync(path.join(root, 'lib/libX')), true);

  const libUninstall = spawnSync(process.execPath, [teaosBin, 'uninstall', '@libY'], { cwd: path.join(root, 'lib/lib1'), encoding: 'utf-8' });
  assert.equal(libUninstall.status, 0);

  const libConfig = JSON.parse(fs.readFileSync(path.join(root, 'lib/lib1/teaos.json'), 'utf8'));
  assert.equal(libConfig.dependencies['@libY'], undefined);
});

test('supports init command and seeds teaos.json from package.json', () => {
  const root = mkTmpDir();
  const repoRoot = path.resolve(__dirname, '..');
  const teaosRoot = path.join(root, 'node_modules/teaos');
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.symlinkSync(repoRoot, teaosRoot, 'dir');
  const teaosBin = path.join(teaosRoot, 'bin/teaos');

  writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'sample-project',
    dependencies: {
      leftpad: '^1.0.0'
    }
  }, null, 2));

  const init = spawnSync(process.execPath, [teaosBin, 'init'], { cwd: root, encoding: 'utf-8' });
  assert.equal(init.status, 0);

  const config = JSON.parse(fs.readFileSync(path.join(root, 'teaos.json'), 'utf8'));
  assert.equal(config.name, 'sample-project');
  assert.deepEqual(config.dependencies, { leftpad: '^1.0.0' });

  writeFile(path.join(root, 'teaos.json'), JSON.stringify({ name: 'keep', dependencies: { kept: '*' } }, null, 2));
  const initNoop = spawnSync(process.execPath, [teaosBin, 'init'], { cwd: root, encoding: 'utf-8' });
  assert.equal(initNoop.status, 0);

  const unchanged = JSON.parse(fs.readFileSync(path.join(root, 'teaos.json'), 'utf8'));
  assert.equal(unchanged.name, 'keep');
  assert.deepEqual(unchanged.dependencies, { kept: '*' });
});

test('supports dependency tracing API and cli tools', () => {
  const root = mkTmpDir();
  const repoRoot = path.resolve(__dirname, '..');
  const teaosRoot = path.join(root, 'node_modules/teaos');
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.symlinkSync(repoRoot, teaosRoot, 'dir');
  const teaosBin = path.join(teaosRoot, 'bin/teaos');

  writeFile(path.join(root, 'teaos.json'), JSON.stringify({
    name: 'project',
    dependencies: { '@core': '*', 'npkg': '^1.0.0' }
  }, null, 2));

  writeFile(path.join(root, 'lib/core/teaos.json'), JSON.stringify({
    name: '@core',
    dependencies: { '@util': '*', 'other': '*' }
  }, null, 2));

  writeFile(path.join(root, 'lib/util/teaos.json'), JSON.stringify({
    name: '@util',
    dependencies: {}
  }, null, 2));

  writeFile(path.join(root, 'node_modules/npkg/teaos.json'), JSON.stringify({
    name: 'npkg',
    dependencies: { '@util': '*' }
  }, null, 2));

  writeFile(path.join(root, 'node_modules/other/teaos.json'), JSON.stringify({
    name: 'other',
    dependencies: {}
  }, null, 2));

  assert.deepEqual(teaos.dependencies(root), ['@core', 'npkg']);
  assert.deepEqual(teaos.localDependencies(root), ['@core']);

  const depsRecursive = teaos.dependencies(root, { recursive: true });
  assert.equal(depsRecursive.includes('@core'), true);
  assert.equal(depsRecursive.includes('npkg'), true);
  assert.equal(depsRecursive.includes('@util'), true);
  assert.equal(depsRecursive.includes('other'), true);

  const localsRecursive = teaos.localDependencies(root, { recursive: true });
  assert.deepEqual(localsRecursive.sort(), ['@core', '@util']);

  const cliDeps = spawnSync(process.execPath, [teaosBin, 'dependencies'], { cwd: root, encoding: 'utf-8' });
  assert.equal(cliDeps.status, 0);
  assert.match(cliDeps.stdout, /@core/);
  assert.doesNotMatch(cliDeps.stdout, /other/);

  const cliDepsAll = spawnSync(process.execPath, [teaosBin, 'dependencies', '-a'], { cwd: root, encoding: 'utf-8' });
  assert.equal(cliDepsAll.status, 0);
  assert.match(cliDepsAll.stdout, /other/);

  const cliLocals = spawnSync(process.execPath, [teaosBin, 'dependencies-local', '-a'], { cwd: root, encoding: 'utf-8' });
  assert.equal(cliLocals.status, 0);
  assert.match(cliLocals.stdout, /@util/);
  assert.doesNotMatch(cliLocals.stdout, /npkg/);
});
