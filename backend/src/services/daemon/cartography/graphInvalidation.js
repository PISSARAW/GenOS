'use strict';

/**
 * Graph Invalidation — ADR 0034 D5.
 *
 * Une modification invalide uniquement le sous-graphe du fichier :
 * ses nœuds (file + symboles) et ses arêtes SORTANTES. Les arêtes
 * ENTRANTES (appelants, dossier parent) sont préservées : les ids
 * étant déterministes, elles redeviennent valides au re-index sans
 * re-parser les appelants. Si le fichier a disparu du disque,
 * updateFiles nettoie ces arêtes pendantes. Première économie du
 * modèle daemon.
 */

const graphStore = require('./graphStore');

async function invalidateFiles(db, args) {
  const files = (args && args.files) || [];
  const result = { invalidated: [], nodesRemoved: 0, edgesRemoved: 0 };
  for (const file of files) {
    const res = await graphStore.deleteFileSubgraph(db, { territoryId: args.territoryId, filePath: file });
    result.invalidated.push(file);
    result.nodesRemoved += res.nodesRemoved;
    result.edgesRemoved += res.edgesRemoved;
  }
  return result;
}

module.exports = { invalidateFiles };
