export const destinations = [
  ['runs', 'inspection'], ['supervision', 'dashboard-view'],
  ['gestion', 'management-view'], ['fichiers', 'files-view'],
  ['laboratoire', 'research-view'], ['mondes', 'worlds-view'], ['memoire', 'knowledge-view'],
  ['organisme', 'organism-view'], ['reprise', 'recovery-view'], ['collectif', 'collective-view']
];

function identifier(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,200}$/.test(value) ? value : null;
}

export function parseRoute(fragment = '') {
  const [pathname, query = ''] = fragment.replace(/^#/, '').split('?');
  const destination = destinations.find(([slug]) => pathname === '/' + slug);
  const params = new URLSearchParams(query);
  return { view: destination?.[1] || 'inspection', runId: identifier(params.get('run')) };
}

export function routeHash(route) {
  const destination = destinations.find(([, view]) => view === route.view) || destinations[0];
  const run = identifier(route.runId);
  const params = new URLSearchParams();
  if (run) params.set('run', run);
  return '#/' + destination[0] + (run ? '?' + params.toString() : '');
}
