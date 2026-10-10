import { byId, node } from './ui.mjs';

export function nodeInspector() {
  const pane = document.querySelector('.builder-inspector');
  const dialog = node('dialog');
  dialog.id = 'node-inspector-dialog';
  dialog.setAttribute('aria-label', 'Configurer le nœud sélectionné');
  const close = node('button', 'Fermer l’inspecteur');
  close.type = 'button';
  close.className = 'inspector-close';
  dialog.append(close, pane);
  document.querySelector('.builder-layout').append(dialog);
  const open = node('button', 'Configurer le nœud');
  open.type = 'button';
  open.className = 'mobile-inspector-button';
  open.setAttribute('aria-controls', dialog.id);
  open.setAttribute('aria-expanded', 'false');
  document.querySelector('.canvas-tools').append(open);
  const mobile = window.matchMedia('(max-width:999px)');
  const hide = () => dialog.close();
  const show = () => {
    if (dialog.open) return;
    dialog.dataset.mode = mobile.matches ? 'mobile' : 'desktop';
    if (mobile.matches) dialog.showModal();
    else dialog.show();
    open.setAttribute('aria-expanded', 'true');
  };
  close.addEventListener('click', hide);
  dialog.addEventListener('close', () => {
    open.setAttribute('aria-expanded', 'false');
    if (open.checkVisibility()) open.focus({ preventScroll: true });
  });
  open.addEventListener('click', show);
  window.addEventListener('studio:node-selected', show);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && dialog.open) hide();
  });
  mobile.addEventListener('change', () => {
    const visible = dialog.open;
    hide();
    if (visible) show();
  });
  for (const event of ['studio:node-applied', 'studio:view', 'studio:cleared', 'studio:workspace']) {
    window.addEventListener(event, hide);
  }
  byId('builder-node-remove').classList.add('danger');
  byId('builder-node-apply').classList.add('primary');
}
