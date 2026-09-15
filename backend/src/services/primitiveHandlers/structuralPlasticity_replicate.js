// ── Replicate ─────────────────────────────────────────────────────────────────

function resolveTargets(context) {
  const targetAgentIds = Array.isArray(context.targetAgents) ? context.targetAgents
    : Array.isArray(context.targets) ? context.targets
    : (context.targetAgent ? [context.targetAgent] : []);
  const targetContextId = firstTruthy(context.targetContext, context.context_id, context.sessionId);
  return { targetAgentIds, targetContextId };
}

function buildTargets(targetAgentIds, targetContextId) {
  if (targetAgentIds.length === 0 && !targetContextId) return [];
  if (targetContextId) {
    return [{ type: 'context', id: targetContextId }]
      .concat(targetAgentIds.map(id => ({ type: 'agent', id })));
  }
  return targetAgentIds.map(id => ({ type: 'agent', id }));
}

function createReplica(source, sourceTraitId, target) {
  const replicatedId = traitFingerprint(source.trait_name, target.id, source.description);
  return {
    trait_id: replicatedId,
    trait_name: source.trait_name,
    description: source.description,
    source_agent_id: source.source_agent_id,
    source_trait_id: sourceTraitId,
    target_id: target.id,
    target_type: target.type,
    confidence: Math.min(1.0, (source.confidence || 0.5) * 0.9),
    usage_count: 0,
    promotion_level: source.promotion_level,
    created_at: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    tags: (source.tags || []).concat(['répliqué']),
    replicatedId
  };
}

function persistReplica(db, replica) {
  return db.run(
    `INSERT OR REPLACE INTO learned_traits (id, trait_name, trait_description, source_agent_id, context_id, trait_data_json, promotion_level, confidence, usage_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    replica.replicatedId, replica.trait_name, replica.description,
    replica.source_agent_id, replica.target_id,
    JSON.stringify({ sourceTraitId: replica.source_trait_id, targetId: replica.target_id, targetType: replica.target_type }),
    replica.promotion_level, replica.confidence, 0,
    replica.created_at
  );
}

async function replicate(context = {}) {
  const db = await getDatabase();
  const sourceTraitId = firstTruthy(context.traitId, context.trait_id, context.id);

  if (!sourceTraitId) return { success: false, error: 'traitId requis pour la réplication.' };

  const { targetAgentIds, targetContextId } = resolveTargets(context);
  if (targetAgentIds.length === 0 && !targetContextId) return { success: false, error: 'targetAgents ou targetContext requis.' };

  const source = await loadTraitOrFail(db, sourceTraitId, learnedTraits);
  if (!source) return { success: false, error: `Trait "${sourceTraitId}" introuvable.` };

  const targets = buildTargets(targetAgentIds, targetContextId);
  const replicated = [];

  for (const target of targets) {
    const replica = createReplica(source, sourceTraitId, target);
    learnedTraits.set(replica.replicatedId, replica);
    await persistReplica(db, replica);
    replicated.push({ target: target.id, target_type: target.type, trait_id: replica.replicatedId });
  }

  telemetry.emitEvent({
    eventType: 'TRAIT_REPLICATED', agentId: source.source_agent_id, action: 'replicate',
    detail: `Trait "${source.trait_name}" répliqué vers ${replicated.length} cible(s).`,
    severity: 'info', payload: { sourceTraitId, replicatedCount: replicated.length }
  });

  return { success: true, source_trait_id: sourceTraitId, source_trait_name: source.trait_name, replicated: replicated.length, targets: replicated, reason: `Trait "${source.trait_name}" répliqué vers ${replicated.length} cible(s).` };
}
