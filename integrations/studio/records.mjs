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
  ['affectedFilesCount', 'Fichiers concernés'], ['snapshotId', 'Snapshot'],
  ['workspaceSnapshotId', 'Snapshot workspace'], ['workspaceSnapshotHash', 'Empreinte workspace'],
  ['agentId', 'Agent'], ['workspaceId', 'Workspace'], ['refName', 'Branche'],
  ['fromCommitId', 'Checkpoint source'], ['clonedAgentId', 'Agent cloné'],
  ['path', 'Champ comparé'], ['left', 'État source'], ['right', 'État alternatif'],
  ['identical', 'États identiques'], ['cloneIsolation', 'Isolation du clone'],
  ['automaticPromotion', 'Promotion automatique'], ['evidenceStatus', 'Statut des sources'],
  ['evidence_status', 'Statut des sources'], ['provenanceHash', 'Empreinte de provenance'],
  ['provenance_hash', 'Empreinte de provenance'], ['content', 'Contenu'],
  ['sourceDecisionId', 'Mémoire source'], ['targetAgentId', 'Agent destinataire'],
  ['truthValidated', 'Vérité validée'], ['promotionGranted', 'Promotion accordée'],
  ['contentHash', 'Empreinte du contenu'], ['content_hash', 'Empreinte du contenu'],
  ['signed', 'Signature présente'], ['signatureValid', 'Signature valide'], ['generation', 'Génération'],
  ['instruction', 'Instruction déclarée'], ['bytes', 'Octets'], ['rate', 'Taux de mutation'],
  ['seed', 'Seed'], ['genomeRef', 'Génome candidat'], ['sourceGenomeId', 'Génome source'],
  ['sourceHash', 'Empreinte source'], ['functionalEffectMeasured', 'Effet fonctionnel mesuré'], ['deployed', 'Déployé'],
  ['runtimePid', 'Processus'], ['processAlive', 'Processus vivant observé'],
  ['processObservation', 'Observation du processus'], ['confirmed', 'Arrêt confirmé'], ['stopped', 'Processus arrêté'],
  ['dissonance', 'Dissonance déclarée'], ['cognitiveBudget', 'Budget cognitif déclaré'],
  ['diagnosisEstablished', 'Diagnostic établi'], ['externalEffectsReversible', 'Effets externes réversibles'],
  ['recoveryScope', 'Portée de récupération'], ['severity', 'Sévérité'],
  ['analysisId', 'Analyse conservée'], ['inputAuthority', 'Autorité des entrées'], ['runtimeApplied', 'Appliqué au runtime'],
  ['scope', 'Portée'], ['organization', 'Organisation'], ['available', 'Capacités disponibles'],
  ['authorized', 'Capacités autorisées'], ['exercised', 'Capacités exercées'], ['contractIsExecution', 'Contrat valant exécution'],
  ['reached', 'Quorum atteint sur ces entrées'], ['support', 'Support calculé'], ['abstentions', 'Abstentions']
];

const nestedRecords = ['targetSnapshot', 'restoredSnapshot', 'safetySnapshot', 'workspace', 'agent', 'claim', 'memory', 'genome', 'step', 'activeOrganization'];

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
