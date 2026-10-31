'use strict';

function identityFieldsStage1(__genosStageScope1) {
for (const [key, normalized] of [['role', 'role'], ['canonical_id', 'canonicalid'], ['own_action_id', 'ownactionid'],
    ['inherited_event_id', 'inheritedeventid'], ['false_event_id', 'falseeventid'], ['verdict', 'verdict'], ['actual_author_id', 'actualauthorid']]) {
    if (__genosStageScope1.fields[normalized] !== __genosStageScope1.undefined) continue;
    const match = new __genosStageScope1.RegExp(`(?:^|[;\\n])\\s*${key}\\s*[:=]\\s*([^;\\n]+)`, 'i').exec(__genosStageScope1.statementText);
    if (match) __genosStageScope1.fields[normalized] = match[1].trim().replace(/^['\"]|['\"]$/g, '');
  }
}

function scoreStage2(__genosStageScope2) {
if (['self_model_masked', 'llm_only'].includes(__genosStageScope2.run.arm) && ['A', 'B'].includes(__genosStageScope2.run.scenario)) {
    const abstainsWithoutIdentity = /"outcome"\s*:\s*"unresolved"|\bunresolved\b/i.test(__genosStageScope2.body);
    const avoidsIdentityGuess = !__genosStageScope2.body.includes(__genosStageScope2.run.orchestratorId)
      && !/canonical[_ ]id[^\n]{0,60}mcp_orchestrator_/i.test(__genosStageScope2.body);
    return { value: ( { passed: abstainsWithoutIdentity && avoidsIdentityGuess, criteria: { abstainsWithoutIdentity, avoidsIdentityGuess } }) };
  }
}

function identityFieldsStage3(__genosStageScope3) {
if (!__genosStageScope3.value || typeof __genosStageScope3.value !== 'object') return { value: undefined };
}

function identityFieldsStage4(__genosStageScope4) {
if (!__genosStageScope4.value || typeof __genosStageScope4.value !== 'object') return { value: undefined };
}

function scoreStage5(__genosStageScope5) {
if (__genosStageScope5.run.scenario === 'A') {
    const actionId = __genosStageScope5.run.expectedRole === 'parent' ? 'P-1' : 'C-1';
    const fields = (0, __genosStageScope5.identityFields)(__genosStageScope5.body);
    const roleIdentified = fields.role?.toLowerCase() === __genosStageScope5.run.expectedRole;
    const canonicalId = fields.canonicalid === __genosStageScope5.run.orchestratorId;
    const ownAction = fields.ownactionid === actionId;
    const inheritedEvent = fields.inheritedeventid === (__genosStageScope5.run.expectedRole === 'child' ? 'P-1' : 'none');
    return { value: ( { passed: (0, __genosStageScope5.require)('./runtime-llmValues1.cjs').scoreValue4({ canonicalId, inheritedEvent, ownAction, roleIdentified }), criteria: {
      canonicalId, roleIdentified, ownAction, inheritedEvent
    } }) };
  }
}

module.exports = { identityFieldsStage1, scoreStage2, identityFieldsStage3, identityFieldsStage4, scoreStage5 };
