function profileFlags(profile) {
  return {
    highRisk: profile.risk === 'high',
    creative: profile.type === 'creative_writing',
    complex: Number(profile.complexity || 0) >= 0.65,
    uncertain: Number(profile.uncertainty || 0) >= 0.6,
    security: profile.type === 'security'
  };
}

module.exports = { profileFlags };
