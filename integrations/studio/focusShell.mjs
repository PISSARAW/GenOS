import { byId, node } from './ui.mjs';
import { organizeViews } from './focusViews.mjs';
import { revealTask } from './taskDeck.mjs';
import { nodeInspector } from './nodeInspector.mjs';
import { compactChrome, groupNavigation } from './productShell.mjs';
import { canvasControls } from './canvasControls.mjs';

function navigationChoice() {
  const label = node('label', 'Espace');
  label.className = 'navigation-choice';
  const select = node('select');
  select.id = 'view-menu';
  label.append(select);
  for (const view of document.querySelectorAll('[data-view]')) {
    const option = node('option', view.querySelector('h2').textContent);
    option.value = view.id;
    select.append(option);
  }
  document.querySelector('.sidebar').append(label);
  select.addEventListener('change', () => {
    const button = document.querySelector(`[data-target="${select.value}"]`);
    if (!button.disabled) button.click();
    syncNavigation();
  });
  window.addEventListener('studio:view', syncNavigation);
}

function syncNavigation() {
  const view = document.querySelector('[data-view]:not([hidden])');
  if (view) byId('view-menu').value = view.id;
}

function disclosure() {
  const context = document.querySelector('.session-context');
  context.open = false;
  context.removeAttribute('data-mobile-drawer');
  const guide = byId('onboarding');
  guide.open = false;
  const content = node('div');
  content.className = 'onboarding-content';
  content.append(guide.querySelector('ol'), guide.querySelector('p'));
  guide.append(content);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { context.open = false; guide.open = false; }
  });
  document.addEventListener('pointerdown', event => {
    if (!context.contains(event.target)) context.open = false;
    if (!guide.contains(event.target)) guide.open = false;
  });
}

function bindings() {
  byId('builder-new').addEventListener('click', () => {
    if (!byId('builder-name').value) revealTask(byId('builder-name'));
  });
  byId('file-diff-button').addEventListener('click', () => revealTask(byId('file-diff')));
  window.addEventListener('studio:workflow-publication', () => {
    revealTask(document.querySelector('[data-action="production-freeze"]'));
  });
  window.addEventListener('studio:cleared', () => {
    document.querySelector('.session-context').open = false;
    byId('onboarding').open = false;
  });
}

export function startFocusedWorkspace() {
  organizeViews();
  nodeInspector();
  navigationChoice();
  groupNavigation();
  disclosure();
  compactChrome();
  canvasControls();
  bindings();
}
