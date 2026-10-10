import { node } from './ui.mjs';
import { recordFields, recordTitle } from './records.mjs';
import { badge } from './presentation.mjs';

function select(browser, index) {
  for (const button of browser.querySelectorAll('[data-record-index]')) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.recordIndex) === index));
  }
  for (const detail of browser.querySelectorAll('[data-record-detail]')) {
    detail.hidden = Number(detail.dataset.recordDetail) !== index;
  }
  browser.querySelector('.record-empty').hidden = index >= 0;
}

function filter(browser, query) {
  let first = -1;
  let count = 0;
  for (const row of browser.querySelectorAll('tbody tr')) {
    row.hidden = !row.textContent.toLocaleLowerCase('fr').includes(query);
    if (!row.hidden) {
      count += 1;
      if (first < 0) first = Number(row.querySelector('button').dataset.recordIndex);
    }
  }
  const selected = browser.querySelector('[aria-pressed=true]');
  if (!selected || selected.closest('tr').hidden) select(browser, first);
  browser.querySelector('.record-count').textContent = count + ' dossier(s) affiché(s)';
}

function recordRow(record, index, browser) {
  const row = node('tr');
  const button = node('button', recordTitle(record));
  button.type = 'button';
  button.dataset.recordIndex = String(index);
  button.setAttribute('aria-pressed', String(index === 0));
  button.addEventListener('click', () => select(browser, index));
  const title = node('td');
  title.append(button);
  const status = recordFields(record).find(([label]) => label === 'État observé');
  const state = node('td');
  state.append(badge(status?.[1]));
  row.append(title, state);
  return row;
}

export function recordBrowser(records, card) {
  const browser = node('div');
  browser.className = 'record-browser';
  const list = node('section');
  list.className = 'record-list';
  list.setAttribute('aria-label', 'Liste des dossiers');
  const search = node('label', 'Filtrer les dossiers');
  const input = node('input');
  input.type = 'search';
  input.placeholder = 'Nom, identifiant ou état';
  search.append(input);
  const table = node('table');
  table.setAttribute('aria-label', 'Dossiers observés');
  const head = node('thead');
  const titles = node('tr');
  for (const text of ['Dossier', 'État observé']) {
    const title = node('th', text);
    title.scope = 'col';
    titles.append(title);
  }
  head.append(titles);
  const body = node('tbody');
  body.append(...records.map((record, index) => recordRow(record, index, browser)));
  table.append(head, body);
  const count = node('p', records.length + ' dossier(s) affiché(s)');
  count.className = 'record-count muted';
  count.setAttribute('role', 'status');
  list.append(search, table, count);
  const inspector = node('section');
  inspector.className = 'record-inspector';
  inspector.setAttribute('aria-label', 'Détail du dossier sélectionné');
  inspector.tabIndex = 0;
  const empty = node('p', 'Aucun dossier ne correspond au filtre.');
  empty.className = 'record-empty';
  empty.hidden = true;
  inspector.append(empty);
  records.forEach((record, index) => {
    const detail = card(record);
    detail.dataset.recordDetail = String(index);
    detail.hidden = index !== 0;
    inspector.append(detail);
  });
  browser.append(list, inspector);
  input.addEventListener('input', () => filter(browser, input.value.trim().toLocaleLowerCase('fr')));
  return browser;
}
