const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const organization = require('../src/services/dynamicOrganizationService');
const { decideFromEvent } = require('../src/services/orchestrationDecisionService');
const runtime = require('../src/services/agentRuntimeAdapter');
const { getDatabase, closeDatabase } = require('../src/db');

async function run() {
  assert.equal(Object.keys(organization.ORGANIZATIONS).length, 19);
  assert.equal(organization.organizationProfile('stigmergy').exchange, 'implicit');
  assert.equal(organization.organizationProfile('red_blue_coevolution').exchange, 'active');
  for (const event of [
    { eventType: 'AGENT_FAILED' },
    { eventType: 'HARD_INVARIANT_FAILURE' },
    { eventType: 'AGENT_COMPLETED', payload: { advice: 'evidence' } },
    { eventType: 'AGENT_COMPLETED' }
  ]) {
    const decision = decideFromEvent(event);
    assert(organization.organizationProfile(decision.organization), `${decision.organization} must be executable, not telemetry-only`);
  }
  assert(runtime.orchestratorToolLease({}).includes('genos_change_organization'));
  assert(runtime.workerToolLease('implementation').includes('genos_worker_publish'));
  assert(!runtime.workerToolLease('implementation').includes('genos_change_organization'));

  const dbPath = path.resolve(__dirname, 'dynamic-organization-test.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);
  try {
    await db.run("INSERT INTO agents(id,name,role,status,execution_mode) VALUES ('org-root','Root','orchestrator','running','orchestrator')");
    await db.run("INSERT INTO agents(id,name,role,status,execution_mode,parent_agent_id) VALUES ('org-a','A','implementation','running','worker','org-root')");
    await db.run("INSERT INTO agents(id,name,role,status,execution_mode,parent_agent_id) VALUES ('org-b','B','reviewer','running','worker','org-root')");

    const initial = await organization.changeOrganization(db, { orchestratorId: 'org-root', organization: 'specialist_expert_committee', reason: 'independent reports', changedBy: 'org-root' });
    assert.equal(initial.version, 1);
    const unchanged = await organization.changeOrganization(db, { orchestratorId: 'org-root', organization: 'specialist_expert_committee', reason: 'still appropriate', changedBy: 'org-root' });
    assert.equal(unchanged.changed, false);
    assert.equal(unchanged.version, 1, 'reaffirming a topology must not create a fake transition');
    const indirect = await organization.publish(db, { orchestratorId: 'org-root', senderAgentId: 'org-a', recipientAgentId: 'org-b', kind: 'evidence', content: 'test passed' });
    assert.equal(indirect.recipientAgentId, 'org-root', 'committee exchanges must pass through the orchestrator');
    assert.equal((await organization.inbox(db, { orchestratorId: 'org-root', requesterAgentId: 'org-b' })).messages.length, 0);
    assert.equal((await organization.inbox(db, { orchestratorId: 'org-root', requesterAgentId: 'org-root' })).messages.length, 1);

    const active = await organization.changeOrganization(db, { orchestratorId: 'org-root', organization: 'red_blue_coevolution', reason: 'active challenge needed', changedBy: 'org-root' });
    assert.equal(active.version, 2);
    await organization.publish(db, { orchestratorId: 'org-root', senderAgentId: 'org-a', kind: 'challenge', content: 'counterexample' });
    assert.equal((await organization.inbox(db, { orchestratorId: 'org-root', requesterAgentId: 'org-b', afterId: indirect.id })).messages[0].content, 'counterexample');

    await organization.changeOrganization(db, { orchestratorId: 'org-root', organization: 'blind_adversarial_review', reason: 'remove reviewer anchoring', changedBy: 'org-root' });
    const blind = await organization.publish(db, { orchestratorId: 'org-root', senderAgentId: 'org-a', kind: 'challenge', content: 'anonymous critique' });
    const blindInbox = await organization.inbox(db, { orchestratorId: 'org-root', requesterAgentId: 'org-b', afterId: blind.id - 1 });
    assert.equal(blindInbox.messages[0].senderAgentId, 'anonymous_worker');

    await organization.changeOrganization(db, { orchestratorId: 'org-root', organization: 'stigmergy', reason: 'leave implicit evidence trails', changedBy: 'org-root' });
    const trace = await organization.publish(db, { orchestratorId: 'org-root', senderAgentId: 'org-a', kind: 'trace', content: 'high-value path' });
    assert.equal(trace.channel, 'stigmergic_trail');

    await organization.changeOrganization(db, { orchestratorId: 'org-root', organization: 'network_silence', reason: 'preserve budget', changedBy: 'org-root' });
    const buffered = await organization.publish(db, { orchestratorId: 'org-root', senderAgentId: 'org-a', kind: 'question', content: 'non-critical chatter' });
    assert.equal(buffered.delivery, 'buffered');
    const critical = await organization.publish(db, { orchestratorId: 'org-root', senderAgentId: 'org-a', kind: 'critical', content: 'invariant broken' });
    assert.equal(critical.delivery, 'delivered');
    const silentInbox = await organization.inbox(db, { orchestratorId: 'org-root', requesterAgentId: 'org-b', afterId: indirect.id });
    assert(silentInbox.messages.some((message) => message.kind === 'critical'));
    assert(!silentInbox.messages.some((message) => message.content === 'non-critical chatter'));

    await organization.changeOrganization(db, { orchestratorId: 'org-root', organization: 'red_blue_coevolution', reason: 'resume collaboration', changedBy: 'org-root' });
    const releasedInbox = await organization.inbox(db, { orchestratorId: 'org-root', requesterAgentId: 'org-b', afterId: indirect.id });
    assert(releasedInbox.messages.some((message) => message.content === 'non-critical chatter'), 'buffered messages must be released when network silence ends');

    await assert.rejects(
      () => organization.changeOrganization(db, { orchestratorId: 'org-root', organization: 'stigmergy', changedBy: 'org-a' }),
      (error) => error.code === 'ORCHESTRATOR_AUTHORITY_REQUIRED'
    );
    await assert.rejects(
      () => organization.publish(db, { orchestratorId: 'org-root', senderAgentId: 'outsider', kind: 'evidence', content: 'spoof' }),
      (error) => error.code === 'ORGANIZATION_MEMBER_REQUIRED'
    );

    for (const [name, policy] of Object.entries(organization.ORGANIZATIONS)) {
      const routed = organization.routeMessage({
        state: { orchestratorId: 'org-root', organization: name, policy },
        sender: { id: 'org-a', role: 'implementation' }, recipientAgentId: 'org-b', kind: 'evidence'
      });
      assert(routed.channel, `${name} must define a communication channel`);
      assert(['delivered', 'buffered'].includes(routed.delivery), `${name} must define delivery semantics`);
    }

    await closeDatabase();
    const bridgeOutput = execFileSync(process.execPath, [
      path.resolve(__dirname, '../bin/genos-orchestrate.cjs'),
      JSON.stringify({
        action: 'organization_publish', background: false,
        orchestratorId: 'org-root', kind: 'evidence', content: 'bridge telemetry check'
      })
    ], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GENOS_DB_PATH: dbPath,
        GENOS_AGENT_ID: 'org-a',
        GENOS_EXECUTION_MODE: 'worker'
      }
    });
    const bridgePublication = JSON.parse(bridgeOutput);
    assert(Number.isInteger(bridgePublication.id));
    assert.equal(bridgePublication.kind, 'evidence');
  } finally {
    await closeDatabase();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  }
  console.log('Dynamic organization checks passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
