'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const fixture = require('./ontogenesisFixture');

const CLI = path.resolve(__dirname, '../bin/genos-ontogenesis.cjs');

function invoke(context, args, expected = 0) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, GENOS_DB_PATH: context.database, GENOS_DB_BOOTSTRAP_SKIP: '1', GENOS_DB_BACKUP_SKIP: '1' },
    encoding: 'utf8', windowsHide: true, timeout: 120000 });
  assert.ifError(result.error);
  assert.strictEqual(result.status, expected, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

async function main() {
  const db = await fixture.memoryDb();
  const root = await fixture.repository();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'onto-cli-test-'));
  const context = { database: path.join(scratch, 'genos.db') };
  try {
    await db.run('VACUUM INTO ?', [context.database]);
    const config = path.join(scratch, 'config.json');
    fs.writeFileSync(config, JSON.stringify(fixture.testConfig()));
    assert.match(invoke(context, ['init', '--root', root, '--project', 'onto_cli', '--config', config]), /projet-cree:onto_cli/);
    const flags = ['--project', 'onto_cli'];
    const task = JSON.parse(invoke(context, ['task', ...flags, '--title', 'CLI task', '--acceptance', '["Complete"]'])).taskId;
    invoke(context, ['priority', ...flags, '--task', task, '--priority', '70']);
    invoke(context, ['message', ...flags, '--body', 'Preserver la compatibilite']);
    invoke(context, ['pause', ...flags, '--reason', 'No provider execution in this test']);
    assert.strictEqual(JSON.parse(invoke(context, ['tick', ...flags])).state, 'PAUSED');
    const tasks = JSON.parse(invoke(context, ['tasks', ...flags]));
    assert.strictEqual(tasks.find((row) => row.id === task).priority, 70);
    const status = JSON.parse(invoke(context, ['status', ...flags, '--json']));
    assert.strictEqual(status.control, 'paused');
    assert.strictEqual(status.pendingInbox, 0);
    invoke(context, ['budgets', ...flags, '--tokens', '180000', '--usd', '2', '--seconds', '400', '--reason', 'Operator decision']);
    invoke(context, ['resume', ...flags]);
    invoke(context, ['stop', ...flags]);
    assert.strictEqual(JSON.parse(invoke(context, ['tick', ...flags])).state, 'STOPPED');
    invoke(context, ['resume', ...flags], 1);
    assert.strictEqual(JSON.parse(invoke(context, ['run', ...flags, '--interval-ms', '10', '--max-ticks', '1'])).state, 'STOPPED');
    invoke(context, ['run', ...flags, '--interval-ms', '-1', '--max-ticks', '1'], 1);
    invoke(context, ['prune', ...flags, '--days', '-1'], 1);
    console.log('ontogenesis operator CLI checks passed (separate processes, persistent SQLite, no external provider).');
  } finally {
    await db.close();
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
