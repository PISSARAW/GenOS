'use strict';
const crypto = require('node:crypto');
const prefix = 'p1-consumer';

async function seed(db) {
  for (const id of [prefix, `${prefix}-foreign`]) {
    await db.run('INSERT OR IGNORE INTO organizations (id,name) VALUES (?,?)', id, id);
  }
  const projects = [['own', prefix], ['sibling', prefix], ['foreign', `${prefix}-foreign`]];
  for (const [id, org] of projects) {
    await db.run('INSERT OR IGNORE INTO projects (id,organization_id,name) VALUES (?,?,?)', `${prefix}-${id}`, org, id);
    await db.run(`INSERT OR REPLACE INTO genome_decisions
      (id,title,content,category,created_by,organization_id,project_id) VALUES (?,?,?,'Failure','fixture',?,?)`,
      `${prefix}-${id}`, 'qualprobe', `qualprobe canary-${id}`, org, `${prefix}-${id}`);
  }
  await db.run(`INSERT OR REPLACE INTO genome_decisions (id,title,content,category,created_by)
    VALUES (?,'qualprobe','qualprobe canary-global','Failure','fixture')`, `${prefix}-global`);
  const credentials = {};
  for (const role of ['operator', 'viewer']) {
    const token = crypto.randomBytes(24).toString('hex');
    const id = `${prefix}-${role}`;
    await db.run('INSERT INTO access_keys (id,label,key_hash,role,is_active) VALUES (?,?,?,?,1)',
      id, id, crypto.createHash('sha256').update(token).digest('hex'), role);
    await db.run('INSERT INTO project_memberships (principal_id,project_id,role) VALUES (?,?,?)',
      id, `${prefix}-own`, role === 'viewer' ? 'viewer' : 'member');
    credentials[role] = token;
  }
  return { ...credentials, organization_id: prefix, project_id: `${prefix}-own` };
}

function privateIds(rows) {
  return rows.map(row => row.id).filter(id => id.startsWith(prefix)).sort();
}

async function embeddingTrap() {
  let requests = 0;
  const server = require('node:http').createServer((request, response) => {
    requests += 1;
    request.resume();
    response.writeHead(503).end('Controlled unavailable embedding provider');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.GENOS_EMBEDDING_URL = `http://127.0.0.1:${server.address().port}`;
  return { get requests() { return requests; }, close: () => new Promise(resolve => server.close(resolve)) };
}

module.exports = { seed, privateIds, prefix, embeddingTrap };
