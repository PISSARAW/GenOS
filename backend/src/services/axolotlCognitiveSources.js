'use strict';
const store = require('./axolotlStateStore');
async function collect(db, input) {
  const refs = input.cognitiveSourceRefs || [];
  if (!Array.isArray(refs) || refs.length > 128) throw store.error('AXOLOTL_COGNITIVE_SOURCES_INVALID');
  const preserved = store.clone(input.preferredPreservation || []);
  for (const ref of refs) {
    if (!input.cognitiveScope.includes(ref.key)) throw store.error('AXOLOTL_COGNITIVE_SCOPE_DENIED');
    const memory = await db.get('SELECT id, agent_id, observation_output FROM episodic_memories WHERE id = ? AND agent_id = ? AND is_purged = 0', ref.memoryId, input.orchestratorId);
    if (!memory) throw store.error('AXOLOTL_COGNITIVE_SOURCE_DENIED');
    preserved.push({ kind: 'knowledge', key: ref.key, value: memory.observation_output,
      ref: `episodic_memory:${memory.id}`, digest: store.hash(memory) });
  }
  return preserved;
}
module.exports = { collect };