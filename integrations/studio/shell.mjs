import { byId } from './ui.mjs';

export function connectedShell(connected) {
  const target = byId(connected ? 'context-scope' : 'connection-scope');
  target.append(byId('scope-controls'));
  byId('connection-panel').hidden = connected;
  byId('session-bar').hidden = !connected;
  byId('navigation').hidden = !connected;
  document.body.dataset.connected = String(connected);
}
