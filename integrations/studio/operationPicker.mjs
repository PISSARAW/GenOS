import { node } from './ui.mjs';

function title(element) {
  return element.querySelector('summary')?.textContent || element.querySelector('button')?.textContent || element.textContent;
}

export function operationPicker(container) {
  const elements = [...container.children].filter(element => element.tagName !== 'H3');
  if (!elements.length) return;
  container.dataset.operationPicker = '';
  const label = node('label', 'Opération');
  label.className = 'operation-choice';
  const select = node('select');
  select.id = container.id + '-choice';
  label.append(select);
  const body = node('div');
  body.className = 'operation-body';
  const items = elements.map((element, index) => operation(element, { container, index, body }));
  container.replaceChildren(label, body);
  const choose = id => {
    for (const item of items) {
      item.pane.hidden = item.id !== id;
      if (item.id === id && item.pane.firstElementChild.tagName === 'DETAILS') item.pane.firstElementChild.open = true;
    }
    select.value = id;
  };
  const filter = query => {
    const matched = items.filter(item => item.title.toLocaleLowerCase('fr').includes(query));
    select.replaceChildren(...matched.map(item => {
      const option = node('option', item.title);
      option.value = item.id;
      return option;
    }));
    const kept = matched.find(item => !item.pane.hidden) || matched[0];
    choose(kept?.id || '');
    const status = document.getElementById(container.id.split('-')[0] + '-filter-status');
    if (status) status.textContent = query ? matched.length + ' opération(s) disponible(s).' : '';
  };
  select.addEventListener('change', () => choose(select.value));
  body.addEventListener('studio:operation', event => {
    filter('');
    choose(event.detail);
  });
  container.addEventListener('studio:operation-filter', event => filter(event.detail));
  filter('');
}

function operation(element, context) {
  const id = element.dataset.action || element.dataset.journeyRead || element.querySelector('form')?.dataset.action ||
    context.container.id + '-' + context.index;
  const pane = node('div');
  pane.dataset.operation = id;
  pane.className = 'operation-pane';
  const label = title(element);
  if (element.tagName === 'DETAILS') element.open = true;
  pane.append(element);
  context.body.append(pane);
  return { id, pane, title: label };
}
