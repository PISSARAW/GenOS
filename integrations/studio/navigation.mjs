import { api, state, perform, loadRun } from './app.mjs';
import { byId, showView } from './ui.mjs';
import { parseRoute, routeHash } from './routes.mjs';

let opening = false;
let pending = false;

function activeSession() {
  return Boolean(api.session && !byId('session-bar').hidden);
}

function publish(route, replace = false) {
  const hash = routeHash(route);
  if (location.hash === hash && !location.search) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', location.pathname + hash);
}

function reveal(view, focus = false) {
  showView(view);
  const title = byId(view).querySelector('h2');
  title.tabIndex = -1;
  if (focus) title.focus({ preventScroll: true });
  window.dispatchEvent(new Event('studio:view'));
}

async function openRoute() {
  if (!activeSession()) return;
  if (state.busy || opening) { pending = true; return; }
  pending = false;
  opening = true;
  const generation = api.generation;
  const route = parseRoute(location.hash);
  try {
    if (route.runId && route.runId !== state.runId) await perform(() => loadRun(route.runId));
    if (generation !== api.generation || !activeSession()) return;
    publish(route, true);
    reveal(route.view, true);
  } finally {
    opening = false;
    if (pending) queueMicrotask(openRoute);
  }
}

function selectView(view) {
  const route = { view, runId: state.runId || parseRoute(location.hash).runId };
  publish(route);
  reveal(view, true);
}

export function startNavigation() {
  document.querySelector('.skip-link').addEventListener('click', event => {
    event.preventDefault();
    byId('view-content').focus();
  });
  for (const button of document.querySelectorAll('[data-target]')) {
    button.addEventListener('click', () => selectView(button.dataset.target));
  }
  window.addEventListener('popstate', openRoute);
  window.addEventListener('hashchange', openRoute);
  window.addEventListener('studio:ready', openRoute);
  window.addEventListener('studio:idle', () => { if (pending) openRoute(); });
  window.addEventListener('studio:loaded', () => {
    if (opening || byId('session-bar').hidden) return;
    const route = parseRoute(location.hash);
    publish({ ...route, runId: state.runId }, true);
  });
  window.addEventListener('studio:session', event => {
    pending = false;
    if (!api.session || event.detail?.reason === 'scope') publish({ view: 'inspection' }, true);
  });
  publish(parseRoute(location.hash), true);
}
