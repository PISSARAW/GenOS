import { perform } from './app.mjs';
import { byId } from './ui.mjs';
import { installDraftGuard, requestContextChange } from './contextGuard.mjs';
import { buildView } from './builderView.mjs';
import { BuilderSession } from './builderSession.mjs';

function bindActions(session) {
  for (const [id, method] of Object.entries({ catalog: 'catalog', load: 'open', save: 'save',
    validate: 'validate', run: 'run', observe: 'observe', publish: 'publication' })) {
    byId('builder-' + id).addEventListener('click', () => {
      if (id === 'load' && !requestContextChange('workflow')) return;
      perform(() => session[method](), { preserveDraft: true });
    });
  }
  byId('builder-new').addEventListener('click', () => {
    if (requestContextChange('workflow')) session.reset();
  });
}

export function startBuilder() {
  const view = buildView();
  const session = new BuilderSession();
  installDraftGuard({ dirty: () => session.dirty() });
  bindActions(session);
  window.addEventListener('studio:workspace', () => session.clear());
  window.addEventListener('studio:cleared', () => session.clear());
  window.addEventListener('studio:ready', () => session.reset());
  session.reset();
  return view;
}
