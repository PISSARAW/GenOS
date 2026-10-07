const labels = [
  ['id', 'Identifiant'], ['claimId', 'Hypothèse'], ['name', 'Nom'], ['title', 'Titre'],
  ['statement', 'Affirmation'], ['status', 'État observé'], ['role', 'Rôle'],
  ['type', 'Type'], ['createdAt', 'Création'], ['created_at', 'Création'],
  ['inputsHash', 'Empreinte des entrées'], ['sourceJobId', 'Job source'],
  ['executionStarted', 'Exécution démarrée'], ['sameCapturedInputs', 'Entrées capturées identiques'],
  ['deterministicOutputGuaranteed', 'Sortie déterministe garantie'],
  ['qualityGuarantee', 'Garantie de qualité'], ['costUsd', 'Coût observé (USD)'],
  ['success', 'Succès déclaré par le service'], ['experimentId', 'Expérience'],
  ['hash', 'Empreinte'], ['parentHash', 'Empreinte parente'], ['assemblyId', 'Assemblage'],
  ['assemblyAccepted', 'Assemblage accepté'], ['integrityChecked', 'Intégrité vérifiée'],
  ['memories', 'Mémoires liées'], ['strategy', 'Stratégie'], ['label', 'Libellé'],
  ['snapshotHash', 'Empreinte du snapshot'], ['durable', 'Payload durable'],
  ['affectedFilesCount', 'Fichiers concernés']
];

const nestedRecords = ['targetSnapshot', 'restoredSnapshot', 'safetySnapshot', 'workspace', 'agent', 'claim'];

export function humanValue(value) {
  if (value === null || value === undefined) return 'Inconnu';
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return value.length + ' éléments';
  return 'Détails disponibles dans l’inspecteur technique';
}

export function recordFields(record) {
  return labels.filter(([key]) => Object.hasOwn(record, key))
    .map(([key, label]) => [label, humanValue(record[key])]);
}

export function recordTitle(record) {
  const key = ['name', 'title', 'statement', 'id', 'claimId'].find(field => typeof record[field] === 'string');
  return key ? record[key] : 'Objet observé';
}

export function collectionGroups(data) {
  if (Array.isArray(data)) return [['Résultats', data]];
  if (!data || typeof data !== 'object') return [];
  const groups = Object.entries(data).filter(([, value]) => Array.isArray(value));
  for (const key of nestedRecords) {
    if (data[key] && typeof data[key] === 'object' && !Array.isArray(data[key])) groups.push([key, [data[key]]]);
  }
  if (recordFields(data).length || !groups.length) groups.unshift(['Dossier', [data]]);
  return groups;
}
