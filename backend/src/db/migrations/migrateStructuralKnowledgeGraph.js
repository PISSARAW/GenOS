async function migrateStructuralKnowledgeGraph(db) {
  // knowledge_graph_relations — relations apprises entre entités (agents, stratégies, contextes)
  const kgExists = await db.get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_graph_relations'"
  );
  if (!kgExists) {
    await db.run(`CREATE TABLE knowledge_graph_relations (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation_type TEXT NOT NULL DEFAULT 'custom',
      strength REAL NOT NULL DEFAULT 1.0,
      metadata_json TEXT,
      created_by TEXT,
      created_at DATETIME NOT NULL DEFAULT (datetime('now')),
      updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
    )`);
    await db.run(`CREATE INDEX idx_kg_source ON knowledge_graph_relations(source_id)`);
    await db.run(`CREATE INDEX idx_kg_target ON knowledge_graph_relations(target_id)`);
    await db.run(`CREATE INDEX idx_kg_type ON knowledge_graph_relations(relation_type)`);
    await db.run(`CREATE INDEX idx_kg_strength ON knowledge_graph_relations(strength)`);
  }

  // learned_traits — traits lamarckiens appris et promus
  const ltExists = await db.get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='learned_traits'"
  );
  if (!ltExists) {
    await db.run(`CREATE TABLE learned_traits (
      id TEXT PRIMARY KEY,
      trait_name TEXT NOT NULL,
      trait_description TEXT,
      source_agent_id TEXT,
      context_id TEXT,
      trait_data_json TEXT,
      promotion_level INTEGER NOT NULL DEFAULT 0,
      confidence REAL NOT NULL DEFAULT 0.5,
      usage_count INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT (datetime('now')),
      updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
    )`);
    await db.run(`CREATE INDEX idx_learned_name ON learned_traits(trait_name)`);
    await db.run(`CREATE INDEX idx_learned_promotion ON learned_traits(promotion_level)`);
    await db.run(`CREATE INDEX idx_learned_confidence ON learned_traits(confidence)`);
    await db.run(`CREATE INDEX idx_learned_source ON learned_traits(source_agent_id)`);
  }

  // Colonnes de consolidation structurelle sur memory_synapses si absentes
  const synapseCols = await db.all("PRAGMA table_info(memory_synapses)");
  const colNames = synapseCols.map(c => c.name);
  if (!colNames.includes('causal_strength')) {
    await db.run(`ALTER TABLE memory_synapses ADD COLUMN causal_strength REAL DEFAULT 1.0`);
  }
  if (!colNames.includes('causal_weight')) {
    await db.run(`ALTER TABLE memory_synapses ADD COLUMN causal_weight REAL DEFAULT 1.0`);
  }
  if (!colNames.includes('last_causal_at')) {
    await db.run(`ALTER TABLE memory_synapses ADD COLUMN last_causal_at DATETIME`);
  }
  if (!colNames.includes('last_stabilized_at')) {
    await db.run(`ALTER TABLE memory_synapses ADD COLUMN last_stabilized_at DATETIME`);
  }
}

module.exports = { migrateStructuralKnowledgeGraph };
