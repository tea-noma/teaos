const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const teaos = require('../index');

function mkTmpDir(){
  return fs.mkdtempSync(path.join(os.tmpdir(), 'teaos-test-'));
}

function writeFile(filePath, content){
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test('supports resource tree API and ls resources command', () => {
  const root = mkTmpDir();
  const cwd = process.cwd();
  const prevPrefixes = process.env.TEAOS_RESOURCE_PREFIXS;
  const repoRoot = path.resolve(__dirname, '..');
  const teaosRoot = path.join(root, 'node_modules/teaos');
  fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
  fs.symlinkSync(repoRoot, teaosRoot, 'dir');
  const teaosBin = path.join(teaosRoot, 'bin/teaos');

  writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'project' }, null, 2));
  writeFile(path.join(root, 'teaos.json'), JSON.stringify({
    name: 'project',
    dependencies: { '@tea-alpha': '*', '@tea-bravo': '*', '@other': '*' }
  }, null, 2));
  writeFile(path.join(root, 'lib/tea-alpha/teaos.json'), JSON.stringify({
    name: '@tea-alpha',
    dependencies: {}
  }, null, 2));
  writeFile(path.join(root, 'lib/tea-bravo/teaos.json'), JSON.stringify({
    name: '@tea-bravo',
    dependencies: {}
  }, null, 2));
  writeFile(path.join(root, 'lib/other/teaos.json'), JSON.stringify({
    name: '@other',
    dependencies: {}
  }, null, 2));
  writeFile(path.join(root, 'lib/tea-alpha/resources/lib/alpha/x.js'), 'alpha\n');
  writeFile(path.join(root, 'lib/tea-alpha/resources/lib/shared.js'), 'alpha shared\n');
  writeFile(path.join(root, 'lib/tea-bravo/resources/lib/bravo/y.js'), 'bravo\n');
  writeFile(path.join(root, 'lib/tea-bravo/resources/lib/shared.js'), 'bravo shared\n');
  writeFile(path.join(root, 'lib/other/resources/lib/other/z.js'), 'other\n');

  process.chdir(root);
  process.env.TEAOS_RESOURCE_PREFIXS = 'tea-';
  try {
    const resources = teaos.resources();
    assert.equal(resources.get('lib/alpha/x.js'), './lib/tea-alpha/resources/lib/alpha/x.js');
    assert.equal(resources.get('lib/bravo/y.js'), './lib/tea-bravo/resources/lib/bravo/y.js');
    assert.equal(resources.get('lib/shared.js'), './lib/tea-bravo/resources/lib/shared.js');
    assert.equal(resources.has('lib/other/z.js'), false);

    const filtered = teaos.resources({ path: 'lib/bravo' });
    assert.deepEqual(Array.from(filtered.keys()), ['lib/bravo/y.js']);

    const cliResources = spawnSync(process.execPath, [teaosBin, 'ls', 'resources', 'lib/bravo'], {
      cwd: root,
      encoding: 'utf-8',
      env: { ...process.env, TEAOS_RESOURCE_PREFIXS: 'tea-' }
    });
    assert.equal(cliResources.status, 0);
    assert.match(cliResources.stdout, /lib\/bravo\/y\.js/);
    assert.doesNotMatch(cliResources.stdout, /lib\/alpha\/x\.js/);
  } finally {
    process.chdir(cwd);
    if(prevPrefixes === undefined){
      delete process.env.TEAOS_RESOURCE_PREFIXS;
    }else{
      process.env.TEAOS_RESOURCE_PREFIXS = prevPrefixes;
    }
  }
});
