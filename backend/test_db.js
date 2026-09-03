const { embed } = require('./src/services/embeddingProvider');
async function test() {
  const { getDatabase } = require('./src/db');
  const realDb = await getDatabase();
  const query = 'Who is Alex';
  const vec = await embed(query);
  console.log('Vec length:', vec ? vec.length : 'null');
  const queryVecJson = JSON.stringify(Array.from(vec));
  const ftsMatch = 'Who OR is OR Alex';
  const decisions = await realDb.all(`
    WITH vector_raw AS (SELECT rowid, distance FROM genome_decisions_vec WHERE embedding MATCH ? AND k = 100),
         vector_matches AS (SELECT rowid, distance, row_number() OVER (ORDER BY distance ASC) as v_rank FROM vector_raw),
         fts_raw AS (SELECT rowid, -bm25(genome_decisions_fts) as f_score FROM genome_decisions_fts WHERE genome_decisions_fts MATCH ?),
         fts_matches AS (SELECT rowid, f_score, row_number() OVER (ORDER BY f_score DESC) as f_rank FROM fts_raw)
    SELECT t.id, v.distance, f.f_score
    FROM genome_decisions t
    LEFT JOIN vector_matches v ON t.rowid = v.rowid
    LEFT JOIN fts_matches f ON t.rowid = f.rowid
    WHERE v.rowid IS NOT NULL OR f.rowid IS NOT NULL LIMIT 5
  `, [queryVecJson, ftsMatch]);
  console.log('Decisions:', decisions.length);
  if (decisions.length > 0) console.log(decisions[0]);
}
test().catch(console.error);
