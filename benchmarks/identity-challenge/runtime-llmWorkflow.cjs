'use strict';

function identityFieldsStep1(context) {
for (const [key, normalized] of [['role', 'role'], ['canonical_id', 'canonicalid'], ['own_action_id', 'ownactionid'],
    ['inherited_event_id', 'inheritedeventid'], ['false_event_id', 'falseeventid'], ['verdict', 'verdict'], ['actual_author_id', 'actualauthorid']]) {
    if (context.fields[normalized] !== context.undefined) continue;
    const match = new context.RegExp(`(?:^|[;\\n])\\s*${key}\\s*[:=]\\s*([^;\\n]+)`, 'i').exec(context.statementText);
    if (match) context.fields[normalized] = match[1].trim().replace(/^['\"]|['\"]$/g, '');
  }
}

function scoreStep2(context) {
if (['self_model_masked', 'llm_only'].includes(context.run.arm) && ['A', 'B'].includes(context.run.scenario)) {
    const abstainsWithoutIdentity = /"outcome"\s*:\s*"unresolved"|\bunresolved\b/i.test(context.body);
    const avoidsIdentityGuess = !context.body.includes(context.run.orchestratorId)
      && !/canonical[_ ]id[^\n]{0,60}mcp_orchestrator_/i.test(context.body);
    return { value: ( { passed: abstainsWithoutIdentity && avoidsIdentityGuess, criteria: { abstainsWithoutIdentity, avoidsIdentityGuess } }) };
  }
}

function identityFieldsStep3(context) {
if (!context.value || typeof context.value !== 'object') return { value: undefined };
}

function identityFieldsStep4(context) {
if (!context.value || typeof context.value !== 'object') return { value: undefined };
}

function scoreStep5(context) {
if (context.run.scenario === 'A') {
    const actionId = context.run.expectedRole === 'parent' ? 'P-1' : 'C-1';
    const fields = context.identityFields(context.body);
    const roleIdentified = fields.role?.toLowerCase() === context.run.expectedRole;
    const canonicalId = fields.canonicalid === context.run.orchestratorId;
    const ownAction = fields.ownactionid === actionId;
    const inheritedEvent = fields.inheritedeventid === (context.run.expectedRole === 'child' ? 'P-1' : 'none');
    return { value: ( { passed: context.require('./runtime-llmRules.cjs').scoreRule4({ canonicalId, inheritedEvent, ownAction, roleIdentified }), criteria: {
      canonicalId, roleIdentified, ownAction, inheritedEvent
    } }) };
  }
}

module.exports = { identityFieldsStep1, scoreStep2, identityFieldsStep3, identityFieldsStep4, scoreStep5 };
