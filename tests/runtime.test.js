const test = require('node:test');
const assert = require('node:assert/strict');
const teaos = require('../index');

test('Mailbox preserves FIFO order for queued messages and waiting receivers', async () => {
  const mailbox = new teaos.Mailbox();
  mailbox.send('first');
  mailbox.send('second');
  assert.equal(await mailbox.recv(), 'first');
  assert.equal(await mailbox.recv(), 'second');

  const first = mailbox.recv();
  const second = mailbox.recv();
  mailbox.send('third');
  mailbox.send('fourth');
  assert.deepEqual(await Promise.all([first, second]), ['third', 'fourth']);
});

test('Mailbox close wakes receivers, rejects sends, and drains queued messages', async () => {
  const mailbox = new teaos.Mailbox();
  const waiting = mailbox.recv();
  mailbox.close();
  mailbox.close();
  await assert.rejects(waiting, { code: 'ERR_MAILBOX_CLOSED' });
  await assert.rejects(mailbox.recv(), { code: 'ERR_MAILBOX_CLOSED' });
  assert.throws(() => mailbox.send('late'), { code: 'ERR_MAILBOX_CLOSED' });

  const queued = new teaos.Mailbox();
  queued.send('saved');
  queued.close();
  assert.equal(await queued.recv(), 'saved');
  await assert.rejects(queued.recv(), { code: 'ERR_MAILBOX_CLOSED' });
});

test('Mailbox message loop keeps its AsyncLocalStorage context across awaits', async () => {
  assert.equal(teaos.supportsAsyncContext, true);
  const mailbox = new teaos.Mailbox();
  const context = { id: 'mailbox-task' };
  const seen = [];
  const loop = teaos.run(context, async () => {
    try {
      while (true) {
        const value = await mailbox.recv();
        seen.push([value, teaos.getContext()]);
      }
    } catch (error) {
      if (error.code !== 'ERR_MAILBOX_CLOSED') throw error;
    }
  });

  await teaos.run({ id: 'sender' }, async () => {
    mailbox.send(1);
    mailbox.send(2);
  });
  mailbox.close();
  await loop;
  assert.deepEqual(seen, [[1, context], [2, context]]);
  assert.notEqual(teaos.getContext(), context);
});

test('hooks and extensionHooks support a statically bundled extension', () => {
  const name = '@teaos-test-hook-runtime';
  const extension = `${name}/lib/extensions/command/example.js`;
  const declared = [];
  const required = [];
  teaos.on('declare', desc => {
    if (desc.name === 'example') declared.push([desc, teaos.extensionKey()]);
  });
  teaos.on('require', key => {
    if (key === name || key === extension) required.push(key);
  });
  teaos.hooks[name] = () => ({ use: options => options });
  teaos.hooks[extension] = () => {
    teaos.declare({ type: 'command', name: 'example' });
    return {};
  };
  teaos.extensionHooks[name] = () => ({ command: { 'example.js': true } });

  try {
    assert.deepEqual(teaos.extensions(name), { command: { 'example.js': true } });
    assert.deepEqual(teaos.use(name, { resources: { command: { 'example.js': true } } }), {
      resources: { command: { 'example.js': true } }
    });
    assert.deepEqual(required, [name, extension]);
    assert.deepEqual(declared.map(([, key]) => key), [extension]);
    assert.equal(teaos.extensionKey(), undefined);
  } finally {
    delete teaos.hooks[name];
    delete teaos.hooks[extension];
    delete teaos.extensionHooks[name];
  }
});
