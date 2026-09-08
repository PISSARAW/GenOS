const ROLE_BY_FAMILY = {
  direct: 'execution', diagnosis: 'diagnosis', exploration: 'exploration',
  temporal: 'replay', collective: 'coordination', memory: 'knowledge', resilience: 'governance'
};

function defineStrategy(family, row) {
  const [id, name, problemTypes, traits = [], maturity = 'implemented', primitives = []] = row;
  return {
    id, name, family, role: ROLE_BY_FAMILY[family], problemTypes, traits, maturity, primitives,
    costLevel: traits.includes('high_compute') ? 5 : traits.includes('parallel') ? 4 : traits.includes('low_cost') ? 1 : 2,
    latencyLevel: traits.includes('deep_search') || traits.includes('temporal') ? 4 : traits.includes('low_latency') ? 1 : 2,
    riskLevel: traits.includes('high_impact') ? 5 : traits.includes('mutation') ? 3 : 1
  };
}

function defineFamily(family, rows) {
  return rows.map((row) => defineStrategy(family, row));
}

module.exports = { defineFamily };
