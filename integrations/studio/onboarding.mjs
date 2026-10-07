import { api, state } from './app.mjs';
import { byId, node } from './ui.mjs';
import { onboardingSteps } from './onboardingSteps.mjs';

function renderGuide() {
  const session = api.session;
  const context = { authenticated: Array.isArray(session?.permissions),
    scoped: Boolean(session?.organization && session?.project),
    agentSelected: Boolean(session?.agent), runRead: Boolean(state.current) };
  byId('onboarding-steps').replaceChildren(...onboardingSteps(context).map(([title, status, detail]) => {
    const item = node('li');
    item.append(node('strong', title + ' — ' + status), node('p', detail));
    return item;
  }));
  if (context.runRead) byId('onboarding').open = false;
  if (!session) byId('onboarding').open = true;
}

export function startOnboarding() {
  renderGuide();
  for (const event of ['studio:session', 'studio:ready', 'studio:idle', 'studio:cleared']) {
    window.addEventListener(event, renderGuide);
  }
}
