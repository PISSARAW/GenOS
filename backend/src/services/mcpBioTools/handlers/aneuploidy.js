// Registry for Genomic Aneuploidy
const aneuploidyRegistry = new Map();

function getAneuploidyRecord(id) {
  if (!aneuploidyRegistry.has(id)) {
    aneuploidyRegistry.set(id, {
      id,
      karyotype: {
        chrom_analyzer: 2, // default diploid
        chrom_verifier: 2,
        chrom_executor: 2
      },
      updatedAt: new Date().toISOString()
    });
  }
  return aneuploidyRegistry.get(id);
}

function handleTrisomyAction(record, aneId, targetChrom) {
  record.karyotype[targetChrom] = 3;
  record.updatedAt = new Date().toISOString();
  return {
    configured: true,
    success: true,
    status: 'trisomy_induced',
    transport: 'aneuploidy_engine',
    aneuploidy_id: aneId,
    target_chromosome: targetChrom,
    copy_count: 3,
    karyotype: record.karyotype,
    output: `Induced trisomy (+1 copy) on '${targetChrom}'. 3 instances ready for 2/3 majority arbitration.`
  };
}

function handleMonosomyAction(record, aneId, targetChrom) {
  record.karyotype[targetChrom] = 1;
  record.updatedAt = new Date().toISOString();
  return {
    configured: true,
    success: true,
    status: 'monosomy_induced',
    transport: 'aneuploidy_engine',
    aneuploidy_id: aneId,
    target_chromosome: targetChrom,
    copy_count: 1,
    karyotype: record.karyotype,
    output: `Induced monosomy (-1 copy) on '${targetChrom}'. 1 instance active for frugal execution.`
  };
}

function handleConsensusAction(args) {
  const votes = Array.isArray(args.votes) ? args.votes : ['APPROVE', 'APPROVE', 'REJECT'];
  const counts = {};
  for (const v of votes) {
    counts[v] = (counts[v] || 0) + 1;
  }
  let winner = null;
  let maxCount = 0;
  for (const [v, cnt] of Object.entries(counts)) {
    if (cnt > maxCount) {
      maxCount = cnt;
      winner = v;
    }
  }
  const isSupermajority = maxCount >= Math.ceil((2 / 3) * votes.length);
  return {
    configured: true,
    success: true,
    status: 'trisomic_consensus_resolved',
    transport: 'aneuploidy_engine',
    votes,
    winner,
    majority_count: maxCount,
    supermajority_achieved: isSupermajority,
    output: `Trisomic consensus resolved: winner='${winner}' with ${maxCount}/${votes.length} votes (Supermajority: ${isSupermajority}).`
  };
}

function handleAneuploidy(args = {}) {
  const action = args.action || 'status';
  const aneId = args.id || `aneu-${Date.now()}`;
  const targetChrom = args.target_chromosome || 'chrom_verifier';
  const record = getAneuploidyRecord(aneId);

  if (action === 'induce_trisomy') {
    return handleTrisomyAction(record, aneId, targetChrom);
  }
  if (action === 'induce_monosomy') {
    return handleMonosomyAction(record, aneId, targetChrom);
  }
  if (action === 'resolve_aneuploid_consensus') {
    return handleConsensusAction(args);
  }

  return {
    configured: true,
    success: true,
    status: 'active',
    transport: 'aneuploidy_engine',
    aneuploidy_id: aneId,
    karyotype: record.karyotype,
    output: `Aneuploidy engine '${aneId}' active. Karyotype: ${JSON.stringify(record.karyotype)}.`
  };
}

function handleAneuploidyError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'aneuploidy_engine',
    output: e.message || 'Unknown aneuploidy error'
  };
}

module.exports = {
  handleAneuploidy,
  handleAneuploidyError,
  aneuploidyRegistry
};
