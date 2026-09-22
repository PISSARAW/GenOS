const MARK_ACTIONS = {
  'Methylation': (gene, level) => { if (level > 0.5) gene.methylated = true; },
  'Acetylation': (gene, level) => { gene.volume = Math.min(1, (gene.volume || 1) + level * 0.5); },
  'Phosphorylation': (gene, level) => { gene.chromatin = Math.max(0, gene.chromatin - 1); }
};

function applyEpigenomeMarks(epigenome, genes) {
  if (!epigenome || typeof epigenome !== 'object') return;
  const marks = epigenome.marks;
  if (!marks || typeof marks !== 'object') return;
  for (const [locus, mark] of Object.entries(marks)) {
    const gene = genes[locus];
    if (gene && MARK_ACTIONS[mark.kind]) MARK_ACTIONS[mark.kind](gene, mark.level);
  }
}

module.exports = { applyEpigenomeMarks };
