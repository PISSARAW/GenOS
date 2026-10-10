import { byId, node } from './ui.mjs';

export function nodeInspector() {
  const pane = document.querySelector('.builder-inspector');
  const dialog = node('dialog');
  dialog.id = 'node-inspector-dialog';
  dialog.setAttribute('aria-label', 'Configurer le nœud sélectionné');
  const close = node('button', 'Fermer l’inspecteur');
  close.type = 'button';
  close.addEventListener('click', () => dialog.close());
  dialog.append(close);
  byId('builder-view').append(dialog);
  const open = node('button', 'Configurer le nœud');
  open.type = 'button';
  open.className = 'mobile-inspector-button';
  document.querySelector('.builder-primary-actions').append(open);
  dialog.append(pane);
  const show = () => { if (!dialog.open) dialog.showModal(); };
  open.addEventListener('click', show);
  window.addEventListener('studio:node-selected', show);
  window.addEventListener('studio:node-applied', () => dialog.close());
  window.addEventListener('studio:view', () => dialog.close());
  window.addEventListener('studio:cleared', () => dialog.close());
  window.addEventListener('studio:workspace', () => dialog.close());
}
