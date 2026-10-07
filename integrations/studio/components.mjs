import { byId, node } from './ui.mjs';
import { collectionGroups, recordFields, recordTitle } from './records.mjs';

const groupNames = {
  experiments: 'Expériences', datasets: 'Datasets', campaigns: 'Campagnes',
  jobs: 'Jobs', cases: 'Cas', claims: 'Hypothèses', evidence: 'Preuves',
  reviews: 'Revues', agents: 'Agents', workspaces: 'Workspaces'
};

function card(record) {
  const item = node('article');
  item.className = 'record-card';
  item.append(node('h4', recordTitle(record)));
  const list = node('dl');
  const fields = recordFields(record);
  for (const [label, value] of fields) {
    list.append(node('dt', label), node('dd', value));
  }
  if (!fields.length) item.append(node('p', 'Dossier disponible dans l’inspecteur technique.'));
  else item.append(list);
  return item;
}

function group(title, items) {
  const section = node('section');
  section.className = 'record-group';
  section.append(node('h3', groupNames[title] || title));
  if (!items.length) section.append(node('p', 'Aucun élément dans ce projet.'));
  const records = items.slice(0, 100).filter(item => item && typeof item === 'object');
  section.append(...records.map(card));
  if (items.length > 100) section.append(node('p', 'Affichage limité aux 100 premiers éléments retournés.'));
  return section;
}

export function renderData(target, data) {
  const groups = collectionGroups(data);
  const content = groups.map(([title, items]) => group(title, items));
  if (!groups.length) content.push(node('p', 'Aucune donnée observée.'));
  byId(target).replaceChildren(...content);
}
