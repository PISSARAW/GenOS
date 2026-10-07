import { byId, node } from './ui.mjs';
import { collectionGroups, recordFields, recordTitle } from './records.mjs';

const groupNames = {
  experiments: 'Expériences', datasets: 'Datasets', campaigns: 'Campagnes',
  jobs: 'Jobs', cases: 'Cas', claims: 'Hypothèses', evidence: 'Preuves',
  reviews: 'Revues', agents: 'Agents', workspaces: 'Workspaces',
  targetSnapshot: 'Snapshot cible', restoredSnapshot: 'Snapshot restauré',
  safetySnapshot: 'Snapshot de sécurité', workspace: 'Workspace', agent: 'Agent', claim: 'Hypothèse',
  affectedFiles: 'Fichiers concernés', checkpoints: 'Checkpoints agent', relatives: 'Agents apparentés',
  sections: 'Sections AgentDNA', genes: 'Gènes', genomes: 'Génomes', incidents: 'Incidents du projet', memory: 'Mémoire',
  topologies: 'Topologies', organizations: 'Organisations collectives', capabilities: 'Capacités requises',
  sensors: 'Capteurs déclarés', indicators: 'Indicateurs', receipts: 'Reçus persistés', probes: 'Probes proposées',
  conditions: 'Conditions du modèle', therapies: 'Thérapies du catalogue', categories: 'Familles',
  immuneEvents: 'Événements immunitaires', pathologies: 'Pathologies runtime', aeisEvidence: 'Preuves AEIS liées au run',
  items: 'Fiches du registre', domains: 'Domaines', relations: 'Relations', neighbors: 'Fiches voisines',
  atoms: 'Propositions', rows: 'Table de vérité', detections: 'Anomalies du modèle', threats: 'Signatures trouvées'
};

function card(record) {
  const item = node('article');
  item.className = 'record-card';
  const title = record.name || record.title || record.statement || record.label || 'Dossier observé';
  item.append(node('h4', title));
  const list = node('dl');
  const fields = recordFields(record);
  for (const [label, value] of fields) {
    if (technicalField(label)) continue;
    list.append(node('dt', label), node('dd', value));
  }
  if (!fields.length) item.append(node('p', 'Dossier disponible dans l’inspecteur technique.'));
  else item.append(list);
  const technical = fields.filter(([label]) => technicalField(label));
  if (technical.length) item.append(technicalDetails(technical));
  return item;
}

function technicalField(label) {
  return /Identifiant|Empreinte|Assemblage$|Snapshot$|Job source|Hypothèse$|Expérience$/.test(label);
}

function technicalDetails(fields) {
  const detail = node('details');
  detail.append(node('summary', 'Identifiants et empreintes'));
  const list = node('dl');
  for (const [label, value] of fields) list.append(node('dt', label), node('dd', value));
  detail.append(list);
  return detail;
}

function group(title, items) {
  const section = node('section');
  section.className = 'record-group';
  section.append(node('h3', groupNames[title] || title));
  if (!items.length) section.append(node('p', 'Aucun élément dans ce projet.'));
  const records = items.slice(0, 100).filter(item => item && typeof item === 'object');
  if (records.length > 1) section.append(recordTable(records));
  else section.append(...records.map(card));
  const values = items.slice(0, 100).filter(item => ['string', 'number'].includes(typeof item));
  if (values.length) {
    const list = node('ul');
    list.append(...values.map(item => node('li', String(item))));
    section.append(list);
  }
  if (items.length > 100) section.append(node('p', 'Affichage limité aux 100 premiers éléments retournés.'));
  return section;
}

function recordTable(records) {
  const container = node('div');
  container.className = 'record-table';
  const table = node('table');
  table.setAttribute('aria-label', 'Dossiers observés');
  const head = node('thead');
  const header = node('tr');
  for (const label of ['Dossier', 'État observé', 'Champs']) {
    const heading = node('th', label);
    heading.scope = 'col';
    header.append(heading);
  }
  head.append(header);
  const body = node('tbody');
  for (const record of records) {
    const row = node('tr');
    const fields = recordFields(record);
    const status = fields.find(([label]) => label === 'État observé');
    const detail = node('details');
    detail.append(node('summary', 'Inspecter'), card(record));
    const cell = node('td');
    cell.append(detail);
    row.append(node('td', recordTitle(record)), node('td', status?.[1] || 'Inconnu'), cell);
    body.append(row);
  }
  table.append(head, body);
  container.append(table);
  return container;
}

export function renderData(target, data) {
  const groups = collectionGroups(data);
  const content = groups.map(([title, items]) => group(title, items));
  if (!groups.length) content.push(node('p', 'Aucune donnée observée.'));
  byId(target).replaceChildren(...content);
}

export function renderResponse(target, data) {
  renderData(target + '-summary', data);
  byId(target).textContent = JSON.stringify(data, null, 2);
}
