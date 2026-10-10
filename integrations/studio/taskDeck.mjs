import { node } from './ui.mjs';

function change(deck, id, focus = false) {
  const tabs = [...deck.querySelectorAll(':scope > .task-tabs [role=tab]')];
  for (const tab of tabs) {
    const active = tab.getAttribute('aria-controls') === id;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
    if (active && focus) tab.focus();
  }
  deck.querySelector(':scope > .task-choice select').value = id;
}

function keyboard(event, deck) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = [...deck.querySelectorAll(':scope > .task-tabs [role=tab]')];
  const index = tabs.indexOf(document.activeElement);
  if (index < 0) return;
  let next = (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = tabs.length - 1;
  event.preventDefault();
  change(deck, tabs[next].getAttribute('aria-controls'), true);
}

export function revealTask(element) {
  const pane = element?.closest('.task-pane');
  if (pane) change(pane.parentElement, pane.id);
  const operation = element?.closest('[data-operation]');
  if (operation) operation.parentElement.dispatchEvent(new CustomEvent('studio:operation', { detail: operation.dataset.operation }));
}

export function taskDeck(view, groups) {
  const heading = view.querySelector(':scope > .view-heading');
  const controls = [...view.querySelectorAll('input, textarea, select, button')];
  const deck = node('div');
  deck.className = 'task-deck';
  const tabs = node('div');
  tabs.className = 'task-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Tâches — ' + heading.querySelector('h2').textContent);
  const label = node('label', 'Vue');
  label.className = 'task-choice';
  const choice = node('select');
  label.append(choice);
  deck.append(tabs, label);
  for (const group of groups) addPane(deck, { group, view, choice });
  view.replaceChildren(heading, deck);
  view.classList.add('focused-view');
  for (const control of controls) if (!view.contains(control)) throw new Error('Contrôle perdu dans ' + view.id);
  tabs.addEventListener('keydown', event => keyboard(event, deck));
  choice.addEventListener('change', () => change(deck, choice.value));
  change(deck, groups[0].pane.id);
}

function addPane(deck, context) {
  const { group, view, choice } = context;
  const id = view.id + '-task-' + group.key;
  const pane = node('section');
  pane.id = id;
  pane.className = 'task-pane';
  pane.setAttribute('role', 'tabpanel');
  pane.setAttribute('aria-labelledby', id + '-tab');
  pane.tabIndex = 0;
  pane.append(...group.content.filter(Boolean));
  const tab = node('button', group.title);
  tab.type = 'button';
  tab.id = id + '-tab';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-controls', id);
  tab.addEventListener('click', () => change(deck, id));
  deck.querySelector('.task-tabs').append(tab);
  const option = node('option', group.title);
  option.value = id;
  choice.append(option);
  deck.append(pane);
  group.pane = pane;
}

export function columns(elements) {
  const container = node('div');
  container.className = 'focus-columns';
  container.append(...elements);
  return container;
}
