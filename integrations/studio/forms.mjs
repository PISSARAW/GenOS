import { api, perform, discover } from './app.mjs';
import { byId, node, applyPermissions } from './ui.mjs';
import { renderResponse } from './components.mjs';

export function field(spec) {
  const [name, label, type = 'text', required = true, initial = ''] = spec;
  const wrapper = node('label', label);
  const input = node(type === 'textarea' ? 'textarea' : 'input');
  if (type !== 'textarea') input.type = type;
  input.name = name;
  input.required = required;
  input.value = initial;
  input.defaultValue = initial;
  if (type === 'number') { input.min = '0'; input.step = 'any'; }
  wrapper.append(input);
  return wrapper;
}

export function values(form) {
  return Object.fromEntries([...new FormData(form)].map(([key, value]) => {
    const input = form.elements.namedItem(key);
    return [key, input.type === 'number' ? Number(value) : String(value).trim()];
  }));
}

function actionTone(spec) {
  return spec.method === 'DELETE' || /-cancel$|-stop$/.test(spec.id) ? 'danger' : 'primary';
}

export function actionForm(spec, container) {
  const detail = node('details');
  detail.append(node('summary', spec.title));
  const form = node('form');
  form.dataset.action = spec.id;
  for (const item of spec.fields || []) form.append(field(item));
  const button = node('button', spec.title);
  button.type = 'submit';
  button.dataset.permission = spec.permission || 'workspace:write';
  button.className = actionTone(spec);
  form.append(button);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (spec.confirm && !window.confirm(spec.confirm)) return;
    perform(async () => {
      const input = values(form);
      const body = spec.body ? spec.body(input) : input;
      const response = await api.request(spec.path(input), { method: spec.method || 'POST', body });
      renderResponse(spec.output || 'management-result', response);
      if (spec.after) await spec.after(response);
      else await discover();
      applyPermissions(api);
      detail.open = false;
    }, { preserveDraft: true });
  });
  detail.append(form);
  container.append(detail);
}
