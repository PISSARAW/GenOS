'use strict';

const { evaluate, replay } = require('../../backend/src/services/relationalPhysiology');
const { input, relation } = require('../../backend/tests/relationalPhysiology/helpers.cjs');

// Explicit synthetic fixtures, no agent run, no paid inference, no network call.
function show(name, value) {
  const decision = evaluate(value);
  console.log(`\n${name}`);
  console.log(`  eligible: ${decision.permitted}`);
  console.log(`  reasons: ${decision.reasonCodes.join(', ') || 'none'}`);
  if (decision.plan.refs) console.log(`  transmitted references: ${decision.plan.refs.map((ref) => ref.id).join(', ')}`);
  if (decision.plan.groups) console.log(`  provenance groups: ${decision.plan.groups.map((group) => group.join('+')).join(' | ')}`);
  console.log(`  receipt: ${decision.receiptHash}`);
  console.log(`  exact replay: ${replay(value, decision).matches}`);
  return decision;
}

const blind = input('communicate');
blind.context.relations = [relation('adversary', ['A', 'B']), relation('friend', ['A', 'B'])];
show('1. Friend + adversary: blind constraint wins', blind);

const unknown = input('verify'); unknown.context.origins = [];
show('2. Unknown provenance cannot certify independence', unknown);

const separate = input('verify');
show('3. Separated recorded provenance: eligible, not statistically proven independent', separate);
const twins = structuredClone(separate); twins.context.relations = [relation('twin', ['C', 'D'])];
show('4. Same input plus twin edge: quorum now refused', twins);
twins.context.relations[0].state = 'revoked';
show('5. Revocation does not erase shared history', twins);

const daemon = input();
daemon.context.agents[0].role = 'resident_daemon';
daemon.request.action = 'write';
const { bind } = require('../../backend/tests/relationalPhysiology/helpers.cjs');
show('6. Over-broad grant cannot make a resident daemon write', bind(daemon));
