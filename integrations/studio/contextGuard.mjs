export function requestContextChange(reason, target = window) {
  return target.dispatchEvent(new CustomEvent('studio:before-context-change', {
    cancelable: true, detail: { reason }
  }));
}

export function installDraftGuard({ target = window, dirty, confirm = message => window.confirm(message) }) {
  const beforeContext = event => {
    if (!dirty()) return;
    if (!confirm('Abandonner le brouillon non sauvegardé avant de changer de contexte ?')) event.preventDefault();
  };
  const beforeUnload = event => {
    if (!dirty()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  target.addEventListener('studio:before-context-change', beforeContext);
  target.addEventListener('beforeunload', beforeUnload);
  return () => {
    target.removeEventListener('studio:before-context-change', beforeContext);
    target.removeEventListener('beforeunload', beforeUnload);
  };
}
