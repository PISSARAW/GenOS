import { byId, node } from './ui.mjs';

export function badge(status) {
  const element = node('span', status || 'Inconnu');
  element.className = 'status-badge';
  element.dataset.status = status || 'unknown';
  return element;
}

export function metricTile(label, value, note = '') {
  const element = node('div');
  element.append(node('span', label), node('strong', value));
  if (note) element.append(node('small', note));
  return element;
}

export function selectPane(button) {
  const target = byId(button.dataset.paneTarget);
  const tabs = button.closest('[role=tablist]').querySelectorAll('[role=tab]');
  for (const tab of tabs) {
    const selected = tab === button;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    byId(tab.dataset.paneTarget).hidden = !selected;
  }
  target.hidden = false;
}

function moveTab(event) {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  const tabs = [...event.currentTarget.querySelectorAll('[role=tab]')];
  const index = tabs.indexOf(document.activeElement);
  if (index < 0) return;
  const direction = event.key === 'ArrowLeft' ? -1 : 1;
  let next = (index + direction + tabs.length) % tabs.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = tabs.length - 1;
  event.preventDefault();
  tabs[next].focus();
  selectPane(tabs[next]);
}

function filterActions(input) {
  const query = input.value.trim().toLocaleLowerCase('fr');
  const items = [...byId(input.dataset.actionFilter).children];
  let count = 0;
  for (const item of items) {
    item.hidden = !item.querySelector('summary').textContent.toLocaleLowerCase('fr').includes(query);
    if (!item.hidden) count += 1;
  }
  const prefix = input.dataset.actionFilter.split('-')[0];
  byId(prefix + '-filter-status').textContent = query ? count + ' action(s) disponible(s).' : '';
}

export function startPresentation() {
  const mobile = window.matchMedia('(max-width:600px)');
  const drawers = () => {
    for (const drawer of document.querySelectorAll('[data-mobile-drawer]')) drawer.open = !mobile.matches;
  };
  mobile.addEventListener('change', drawers);
  drawers();
  for (const tab of document.querySelectorAll('[data-pane-target]')) {
    tab.addEventListener('click', () => selectPane(tab));
  }
  for (const tabs of document.querySelectorAll('[role=tablist]')) tabs.addEventListener('keydown', moveTab);
  for (const input of document.querySelectorAll('[data-action-filter]')) {
    input.addEventListener('input', () => filterActions(input));
  }
  window.addEventListener('studio:cleared', () => {
    for (const input of document.querySelectorAll('[data-action-filter]')) {
      input.value = '';
      filterActions(input);
    }
    selectPane(byId('trace-timeline-tab'));
    byId('run-status').removeAttribute('data-status');
  });
}
