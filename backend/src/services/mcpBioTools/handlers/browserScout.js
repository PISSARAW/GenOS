const { defaultBrowserScout } = require('../../browserScoutService');

async function handleBrowserScout(args) {
  const action = args.action || 'navigate';
  const sessionId = args.session_id || args.sessionId || 'scout-main';

  if (action === 'navigate') {
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

  if (action === 'act' || action === 'click' || action === 'fill' || action === 'select_option' || action === 'submit') {
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

  if (action === 'snapshot') {
    const snap = defaultBrowserScout.snapshotSession(sessionId);
    return {
      configured: true,
      success: Boolean(snap),
      status: snap ? 'completed' : 'tool_error',
      transport: 'local_service',
      output: JSON.stringify(snap || { error: 'Session not found' }, null, 2)
    };
  }

  if (action === 'download_intercept') {
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
