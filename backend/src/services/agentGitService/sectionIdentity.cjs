'use strict';

/**
 * Identité stable d'un item par section de l'état agent-git.
 * Point 4 de l'audit : les opérations génériques (computePatch, applyPatch,
 * merges) ne doivent JAMAIS écrire `.id` directement — les sections ont des
 * clés hétérogènes :
 *   decisions   -> id
 *   memories    -> id
 *   runs        -> id
 *   plasmids    -> plasmid_id
 *   permissions -> clé de scope (organization_id + ':' + project_id)
 *   events      -> event_id
 *   children    -> id
 */
function identityOf(section, item) {
  if (!item || typeof item !== 'object') return undefined;
  switch (section) {
    case 'plasmids':
      return item.plasmid_id;
    case 'permissions':
      return `${item.organization_id || ''}:${item.project_id || ''}`;
    case 'events':
      return item.event_id;
    default:
      return item.id;
  }
}

module.exports = { identityOf };
