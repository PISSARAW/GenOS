function json(value, fallback) {
  try { return JSON.parse(value || ''); } catch (_) { return fallback; }
}

async function enforceHooks(optionsOrDb, maybeAgentId, maybeHookName, maybeContext) {
  let db, agentId, hookName, context;
  if (optionsOrDb && typeof optionsOrDb === 'object' && optionsOrDb.db) {
    ({ db, agentId, hookName, context } = optionsOrDb);
  } else {
    db = optionsOrDb;
    agentId = maybeAgentId;
    hookName = maybeHookName;
    context = maybeContext;
  }
  const hooks = await db.all('SELECT policy_json, enabled FROM agent_git_hooks WHERE agent_id = ? AND hook_name = ?', agentId, hookName).catch(() => []);
  for (const hook of hooks) {
    if (!hook.enabled) continue;
    const policy = json(hook.policy_json, {});
    if (hookName === 'signature-required' && !process.env.GENOS_AGENT_GIT_SIGNING_PRIVATE_KEY && policy.required !== false) throw Object.assign(new Error('Signature-required hook needs a signing key.'), { code: 'AGENT_SIGNATURE_REQUIRED' });
    if (policy.requireHealthy === true && ['error', 'apoptosis', 'blocked'].includes(context?.agent?.status)) throw Object.assign(new Error('Agent hook rejected an unhealthy agent.'), { code: 'AGENT_HOOK_REJECTED' });
  }
}

module.exports = { enforceHooks };
