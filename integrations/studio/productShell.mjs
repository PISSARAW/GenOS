import { byId, node } from './ui.mjs';

const families = [
  ['Construire', ['builder-view', 'files-view']],
  ['Exécuter', ['inspection', 'dashboard-view']],
  ['Explorer GenOS', ['research-view', 'worlds-view', 'knowledge-view', 'organism-view', 'recovery-view', 'reference-view']],
  ['Publier', ['production-view']],
  ['Administrer', ['management-view']]
];

export function groupNavigation() {
  const navigation = byId('navigation');
  const menu = byId('view-menu');
  for (const [title, ids] of families) {
    const section = node('section');
    section.className = 'navigation-family';
    section.append(node('h2', title));
    const options = node('optgroup');
    options.label = title;
    for (const id of ids) {
      section.append(navigation.querySelector(`[data-target="${id}"]`));
      options.append(menu.querySelector(`option[value="${id}"]`));
    }
    navigation.append(section);
    menu.append(options);
  }
}

export function compactChrome() {
  const header = document.querySelector('.topbar');
  const tools = node('div');
  tools.className = 'shell-tools';
  const context = document.querySelector('.session-context');
  context.querySelector('summary').textContent = 'Contexte du projet';
  context.querySelector('.session-fields').append(byId('disconnect'));
  const guide = byId('onboarding');
  guide.querySelector('summary').textContent = 'Aide';
  tools.append(byId('message'), byId('session-bar'), guide);
  header.append(tools);
  document.querySelector('.environment-tag').remove();
  const title = byId('view-label');
  const update = () => {
    const view = document.querySelector('[data-view]:not([hidden])');
    title.textContent = view?.querySelector('h2')?.textContent || 'Espace de travail';
  };
  window.addEventListener('studio:view', update);
  window.addEventListener('studio:ready', update);
}
