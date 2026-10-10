import { byId, node } from './ui.mjs';

function zoom(container, value) {
  const svg = container.querySelector('svg');
  if (!svg) return;
  const scale = Math.min(2, Math.max(.25, value));
  container.dataset.zoom = String(scale);
  svg.style.width = svg.viewBox.baseVal.width * scale + 'px';
  svg.style.height = svg.viewBox.baseVal.height * scale + 'px';
  byId('canvas-zoom-label').textContent = Math.round(scale * 100) + '%';
}

export function canvasControls() {
  const container = byId('builder-canvas');
  container.dataset.zoom = '1';
  const controls = node('div');
  controls.className = 'canvas-zoom';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Zoom du graphe');
  const label = node('output', '100%');
  label.id = 'canvas-zoom-label';
  label.setAttribute('aria-label', 'Échelle du graphe');
  const actions = [
    ['Réduire le graphe', '−', () => zoom(container, Number(container.dataset.zoom) - .1)],
    ['Agrandir le graphe', '+', () => zoom(container, Number(container.dataset.zoom) + .1)],
    ['Ajuster le graphe à la largeur', 'Ajuster', () => {
      const width = container.querySelector('svg')?.viewBox.baseVal.width;
      if (width) zoom(container, (container.clientWidth - 32) / width);
    }],
    ['Rétablir le zoom à 100%', '100%', () => zoom(container, 1)]
  ];
  for (const [name, text, action] of actions) {
    const button = node('button', text);
    button.type = 'button';
    button.setAttribute('aria-label', name);
    button.addEventListener('click', action);
    controls.append(button);
  }
  controls.append(label);
  document.querySelector('.canvas-tools').append(controls);
  const observer = new MutationObserver(() => zoom(container, Number(container.dataset.zoom)));
  observer.observe(container, { childList: true });
  window.addEventListener('studio:cleared', () => zoom(container, 1));
}
