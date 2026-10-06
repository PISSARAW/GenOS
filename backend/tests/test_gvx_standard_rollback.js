'use strict';

const assert=require('node:assert/strict');
const fixtures=require('./helpers/gvxStandardFixture');
const ledger=require('../src/services/gvxDevelopmentLedger');
const {hash}=require('../src/services/gvxContracts');

async function main() {
  const fixture=await fixtures.createFixture({regress:true});
  try {
    const signal={scope:fixtures.scope,entityId:fixtures.scope.entityId,agentId:fixtures.scope.entityId,
      sourceEventId:'rollback',signalType:'skill_gap',evidenceRefs:['functional-fixture'],context:{}};
    const result=await require('../src/services/gvxLifecycleAdapterProvider').runConfiguredCycle(fixture.db,signal);
    assert.equal(result.status,'rollback_recorded');
    assert.equal(result.monitoring.results.at(-1).rollback.payload.result.status,'restored');
    const current=await require('../src/services/agow/agowMechanismPolicyService').load({db:fixture.db,agentId:fixtures.scope.entityId});
    assert.equal(hash(current),hash(fixture.profile.parentPolicy));
    const events=await ledger.listAllEvents(fixture.db,fixtures.scope);
    assert.equal(events.filter(event=>event.payload.kind==='developmental_credit_applied').length,0);
    const replay=await require('../src/services/gvxLifecycleAdapterProvider').runConfiguredCycle(fixture.db,signal);
    assert.equal(replay.replayed,true);
    assert.equal((await ledger.listAllEvents(fixture.db,fixtures.scope)).length,events.length);
  } finally {await fixtures.closeFixture(fixture);}
  console.log('GVX standard rollback: independently verified regression restores the exact parent without credit.');
}

main().catch(error=>{console.error(error);process.exitCode=1;});
