'use strict';

function array(node, maximum) {
  if (node) node.maxItems = Math.max(node.minItems || 0, maximum);
}
function strings(node, maximum) {
  array(node, maximum);
  if (node?.items?.type === 'string') node.items.maxLength = 600;
}
function apply(schema, options) {
  const fields = schema.properties, claims = fields.claims;
  array(claims, 4);
  claims.items.properties.statement.maxLength = 600;
  const references = claims.items.properties.evidence;
  array(references, Math.max(8, references.items.enum?.length || 0));
  strings(fields.uncertainties, 8);
  strings(fields.integrationConstraints, Math.max(8, options.handoffs.length * 2));
  array(fields.acceptanceEvaluations, options.missionCriteria.length);
  const content = fields.workerArtifact.properties.content.properties;
  strings(content.assumptions, 4);
  content.falsificationTest.maxLength = 800;
  return schema;
}

module.exports = { apply };
