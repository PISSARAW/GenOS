import { api, perform } from './app.mjs';
import { byId } from './ui.mjs';

async function diagnostics() {
  const [backend, rust] = await Promise.all([api.request('/api/studio/status'), api.request('/api/rust/status')]);
  byId('operations-result').textContent = JSON.stringify({ backend, rust }, null, 2);
}

async function restart() {
  const operation = await api.request('/api/studio/restart', { body: { confirmed: true }, timeoutMs: 120000 });
  const generation = api.generation;
  const deadline = Date.now() + 90000;
  byId('operations-result').textContent = `Redémarrage demandé : ${operation.operationId}. Attente d’une nouvelle instance prête…`;
  while (Date.now() < deadline && api.generation === generation) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      const status = await api.request('/api/studio/status?operationId=' + encodeURIComponent(operation.operationId), { timeoutMs: 3000 });
      if (status.ready && status.instanceId !== operation.instanceId && status.operation?.state === 'completed') {
        byId('operations-result').textContent = JSON.stringify(status, null, 2);
        return;
      }
    } catch (error) { if ([401, 403].includes(error.status)) throw error; }
  }
  if (api.generation !== generation) return;
  throw new Error('Redémarrage non confirmé. Vérifier les journaux du superviseur ; aucune réussite n’est présumée.');
}

export function startOperations() {
  byId('operations-diagnostics').addEventListener('click', () => perform(diagnostics));
  byId('operations-restart').addEventListener('click', () => {
    if (window.confirm('Redémarrer le backend global ? Toutes les missions gérées doivent être arrêtées et vérifiées.')) perform(restart);
  });
}
