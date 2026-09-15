function computeCombinedIndex(components) {
  const { entropy, mobility, morph, strong, reorganize } = components;
  return Number(
    entropy * WEIGHTS.diversité_synaptique +
    mobility * WEIGHTS.mobilité_topologique +
    morph * WEIGHTS.richesse_morphologies +
    strong * WEIGHTS.force_traces_forts +
    reorganize * WEIGHTS.capacité_reorganisation
  ).toFixed(4);
}
