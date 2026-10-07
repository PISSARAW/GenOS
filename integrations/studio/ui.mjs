export const byId = id => document.getElementById(id);
export const encoded = value => encodeURIComponent(value);

export function node(tag, text = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

export function displayList(id, items, describe) {
  const rows = items.map(item => node('li', describe(item)));
  byId(id).replaceChildren(...(rows.length ? rows : [node('li', 'Aucune donnée disponible.')]));
}

export function options(id, items) {
  byId(id).replaceChildren(...items.map(item => {
    const option = node('option', item.name || item.id);
    option.value = item.id;
    return option;
  }));
}

export function applyPermissions(api) {
  for (const element of document.querySelectorAll('[data-permission]')) {
    element.disabled = !api.allowed(element.dataset.permission);
    element.title = element.disabled ? 'Permission requise : ' + element.dataset.permission : '';
  }
}

export function errorMessage(error) {
  if (error.name === 'AbortError') return 'Le backend n’a pas répondu dans le délai imparti ou l’opération a été annulée.';
  if (error.code === 'INVALID_APPROVAL_JSON') return 'Dossier d’approbation JSON invalide.';
  if (error instanceof SyntaxError) return 'Réponse backend invalide (JSON attendu).';
  if (error instanceof TypeError) return 'Backend inaccessible. Vérifiez la connexion réseau.';
  return error.message;
}

export function showView(id) {
  for (const section of document.querySelectorAll('[data-view]')) section.hidden = section.id !== id;
  for (const button of document.querySelectorAll('[data-target]')) {
    button.setAttribute('aria-pressed', String(button.dataset.target === id));
  }
}
