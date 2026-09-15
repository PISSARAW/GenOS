async function applyStructuralChanges(opts) {
  const { db, weightThreshold, causalThreshold, timestamp } = opts;
  let prunedCount = 0;
  let stabilizedCount = 0;
  await withTransaction(db, async (tx) => {
    const pruned = await tx.all(`SELECT source_id, target_id, weight FROM memory_synapses WHERE weight < ? AND causal_strength < ?`, weightThreshold, causalThreshold);
    for (const p of pruned) {
      await tx.run(`DELETE FROM memory_synapses WHERE source_id = ? AND target_id = ?`, p.source_id, p.target_id);
    }
    prunedCount = pruned.length;
    const strong = await tx.all(`SELECT source_id, target_id, weight, receptor_density FROM memory_synapses WHERE weight >= ? AND causal_strength >= ?`, weightThreshold, causalThreshold);
    for (const s of strong) {
      const newDensity = Math.min(3.0, (s.receptor_density || 1.0) + 0.05);
      await tx.run(
        `UPDATE memory_synapses SET receptor_density = ?, spine_morphology = CASE WHEN ? >= 2.5 THEN 'mushroom' WHEN ? >= 1.5 THEN 'stubby' ELSE spine_morphology END, last_stabilized_at = ? WHERE source_id = ? AND target_id = ?`,
        Number(newDensity.toFixed(3)), newDensity, newDensity, timestamp, s.source_id, s.target_id
      );
    }
    stabilizedCount = strong.length;
  });
  return { pruned: prunedCount, stabilized: stabilizedCount };
}
