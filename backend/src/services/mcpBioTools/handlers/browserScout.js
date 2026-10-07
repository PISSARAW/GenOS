const { defaultBrowserScout } = require('../../browserScoutService');
const { WebJourneyVerifier } = require('../../webJourneyVerifier');

async function handleBrowserScout(args) {
  const action = args.action || 'navigate';
  const sessionId = args.session_id || args.sessionId || 'scout-main';

  if (action === 'verify_journey') {
    return browserScoutVerifyJourney({ args });
  }

  if (action === 'open_browser_session') {
    return browserScoutOpenBrowserSession({ args, sessionId });
  }

  if (action === 'navigate') {
    return browserScoutNavigate({ args, sessionId });
  }

  if (['act', 'click', 'fill', 'select_option', 'submit'].includes(action)) {
    return browserScoutAct({ args, action, sessionId });
  }

  if (action === 'snapshot') {
    return browserScoutSnapshot({ sessionId });
  }

  if (action === 'download_intercept') {
    return browserScoutDownloadIntercept({ args, sessionId });
  }

  return {
    configured: true,
    success: false,
    status: 'invalid_action',
    transport: 'local_service',
    output: `Unknown browser scout action: ${action}`
  };
}

function handleBrowserScoutError(e) {
  return {
    configured: true,
    success: false,
    status: 'tool_error',
    transport: 'local_service',
    output: e.message || String(e)
  };
}

module.exports = {
  handleBrowserScout,
  handleBrowserScoutError
};

async function browserScoutVerifyJourney({ args }) {
  const allowedHosts = (process.env.GENOS_BROWSER_VERIFICATION_HOSTS || '')
    .split(',').map(host => host.trim().toLowerCase()).filter(Boolean);
  const result = await new WebJourneyVerifier({ allowedHosts }).verify(args.journey);
  return { configured: true, success: result.verified,
    status: result.verified ? 'completed' : 'tool_error',
    transport: 'local_service', output: JSON.stringify(result, null, 2) };
}

async function browserScoutOpenBrowserSession({ args, sessionId }) {
  const res = await defaultBrowserScout.openBrowserSession(sessionId, {
    timeoutMs: args.timeout_ms || args.timeoutMs,
    width: args.width, height: args.height
  });
  return { configured: true, success: res.opened, status: 'completed', transport: 'local_service', output: JSON.stringify(res, null, 2) };
}

async function browserScoutNavigate({ args, sessionId }) {
  const res = await defaultBrowserScout.navigate(sessionId, args.url || 'https://google.com', {
    htmlContent: args.html_content || args.html
  });
  return {
    configured: true,
    success: res.success,
    status: res.success ? 'completed' : 'tool_error',
    transport: 'local_service',
    output: JSON.stringify(res, null, 2)
  };
}

async function browserScoutAct({ args, action, sessionId }) {
  const actType = action === 'act' ? (args.type || 'click') : action;
  const res = await defaultBrowserScout.act(sessionId, {
    type: actType,
    selectorId: args.selector_id || args.selectorId || args.target,
    value: args.value
  });
  return {
    configured: true,
    success: res.success,
    status: res.success ? 'completed' : 'tool_error',
    transport: 'local_service',
    output: JSON.stringify(res, null, 2)
  };
}

async function browserScoutSnapshot({ sessionId }) {
  const snap = defaultBrowserScout.snapshotSession(sessionId);
  return {
    configured: true,
    success: Boolean(snap),
    status: snap ? 'completed' : 'tool_error',
    transport: 'local_service',
    output: JSON.stringify(snap || { error: 'Session not found' }, null, 2)
  };
}

async function browserScoutDownloadIntercept({ args, sessionId }) {
  const session = defaultBrowserScout.getSession(sessionId);
  const dl = await defaultBrowserScout.interceptDownload(session, args.url || 'https://mock.doc/data.csv', args.content ? Buffer.from(args.content) : null);
  return {
    configured: true,
    success: true,
    status: 'completed',
    transport: 'local_service',
    output: JSON.stringify(dl, null, 2)
  };
}
