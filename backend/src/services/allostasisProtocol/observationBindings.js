'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const c = require('./qualificationConfig');

function exact(value, keys) {
  if (!value || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) c.fail('ALLOSTASIS observation query has unsupported fields.');
}

function query(message, value, kind) {
  return { scope: message.scope, missionId: message.missionId, conversationId: message.conversationId,
    [`${kind}Id`]: value[`${kind}Id`], [`${kind}Digest`]: digest(value) };
}

function forecastQuery(input) {
  const value = c.copy(input);
  exact(value, ['scope', 'missionId', 'conversationId', 'forecastId', 'forecastDigest']);
  exact(value.scope, ['organizationId', 'projectId']);
  [value.scope.organizationId, value.scope.projectId, value.missionId, value.conversationId, value.forecastId].forEach(c.text);
  if (!/^sha256:[a-f0-9]{64}$/.test(value.forecastDigest)) c.fail('ALLOSTASIS forecast digest invalid.');
  return value;
}

function scope(message, value) {
  if (!c.same(message.scope, value.scope) || message.missionId !== value.missionId) c.fail('ALLOSTASIS observation scope or mission mismatch.');
}

function context(message) {
  return { scope: message.scope, missionId: message.missionId, conversationId: message.conversationId,
    sender: message.sender, audience: message.audience, generations: message.generations, authority: message.authority };
}

function forecastBinding(message, prior) {
  const forecast = message.payload.forecast;
  if (!prior || digest(prior.report) !== forecast.reportDigest || !c.same(prior.report.subject, forecast.subject)) c.fail('ALLOSTASIS forecast report binding mismatch.');
  if (!c.same(context(message), context(prior.message))) c.fail('ALLOSTASIS forecast producer context changed.');
  if (!message.causalRefs.includes(prior.message.messageId)) c.fail('ALLOSTASIS forecast must reference its state report.');
  if (prior.report.status !== 'available') c.fail('ALLOSTASIS unavailable measurements cannot qualify a forecast.');
}

function qualified(value, result, kind) {
  if (!result || !c.same(result[kind], value) || result[`${kind}Digest`] !== digest(value)) c.fail('ALLOSTASIS native observation qualification binding mismatch.');
  availability(value, result, kind);
  if (result.allocationAuthorized !== false) c.fail('ALLOSTASIS qualification cannot allocate resources.');
  return c.copy(result);
}

function availability(value, result, kind) {
  if (kind === 'report') {
    if (result.available !== (value.status === 'available')) c.fail('ALLOSTASIS measurement availability mismatch.');
    return;
  }
  if (result.available !== true) c.fail('ALLOSTASIS forecast source unavailable.');
  if (!result.report || digest(result.report) !== value.reportDigest) c.fail('ALLOSTASIS forecast qualification omitted its exact measurement report.');
}

module.exports = { query, forecastQuery, scope, context, forecastBinding, qualified };
