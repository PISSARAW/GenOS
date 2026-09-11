/**
 * GenOS Synaptic Spike Train & Genomic CIGAR Diff Service
 * Replaces JSON traces and line dumps with neuromorphic spike trains (STDP)
 * and genomic CIGAR/VCF mutation strings.
 */

function computeSTDP(preSpikeMs, postSpikeMs, tauMs = 20.0, learningRate = 0.1) {
  const deltaT = postSpikeMs - preSpikeMs;
  const magnitude = Math.exp(-Math.abs(deltaT) / Math.max(1.0, tauMs));
  const sign = deltaT > 0 ? 1.0 : -1.0;
  const deltaWeight = Number((learningRate * sign * magnitude).toFixed(5));

  return {
    deltaT,
    deltaWeight,
    isPotentiation: deltaWeight > 0,
    isDepression: deltaWeight < 0
  };
}

function processSynapticSpikes(synapse, spikes = []) {
  let weight = synapse.weight ?? 1.0;
  let lastSpikeTime = synapse.lastSpikeMs || 0;
  const history = [];

  for (const spike of spikes) {
    const transmitter = spike.transmitter || 'glutamate';
    const postTime = spike.timestampMs || (lastSpikeTime + 5);
    const stdp = computeSTDP(lastSpikeTime, postTime);

    let transmitterMultiplier = 1.0;
    if (transmitter === 'gaba') transmitterMultiplier = -0.8;
    else if (transmitter === 'dopamine') transmitterMultiplier = 1.5;
    else if (transmitter === 'serotonin') transmitterMultiplier = 0.5;

    weight = Math.max(0.01, Math.min(10.0, weight + stdp.deltaWeight * transmitterMultiplier));
    lastSpikeTime = postTime;

    history.push({
      transmitter,
      timestampMs: postTime,
      newWeight: Number(weight.toFixed(4))
    });
  }

  return {
    synapseId: synapse.id || 'syn-anonymous',
    finalWeight: Number(weight.toFixed(4)),
    history
  };
}

function encodeCigarDiff(originalLines = [], modifiedLines = []) {
  let cigar = '';
  let i = 0;
  let j = 0;
  const mutations = [];

  while (i < originalLines.length && j < modifiedLines.length) {
    if (originalLines[i] === modifiedLines[j]) {
      let matchCount = 0;
      while (i < originalLines.length && j < modifiedLines.length && originalLines[i] === modifiedLines[j]) {
        matchCount++;
        i++;
        j++;
      }
      cigar += `${matchCount}M`;
    } else {
      // Substitution or variant
      mutations.push({ locus: i, from: originalLines[i], to: modifiedLines[j] });
      cigar += '1X';
      i++;
      j++;
    }
  }

  if (i < originalLines.length) {
    const delCount = originalLines.length - i;
    cigar += `${delCount}D`;
    for (let k = i; k < originalLines.length; k++) {
      mutations.push({ locus: k, from: originalLines[k], to: null, kind: 'deletion' });
    }
  } else if (j < modifiedLines.length) {
    const insCount = modifiedLines.length - j;
    cigar += `${insCount}I`;
    for (let k = j; k < modifiedLines.length; k++) {
      mutations.push({ locus: k, from: null, to: modifiedLines[k], kind: 'insertion' });
    }
  }

  return {
    cigarString: cigar || '0M',
    mutationCount: mutations.length,
    mutations
  };
}

module.exports = {
  computeSTDP,
  processSynapticSpikes,
  encodeCigarDiff
};
