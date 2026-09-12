/**
 * GenOS MCP STDIO process session.
 * Owns the child lifecycle and EPIPE-safe IO: every stdio stream carries an
 * `error` handler with a per-stream counter, and stdin writes are guarded
 * (writable check + try/catch) so a dead peer rejects the pending request
 * cleanly instead of crashing the backend.
 */
const { spawn } = require('child_process');
const { appendBounded } = require('../../boundedOutput');
const { terminateChild, clearTerminationTimer } = require('../../processTermination');
const { encodeLine, splitLines } = require('./stdioProtocol');

function startSession(config) {
  const tokens = config.parseArgs(config.commandLine);
  const executable = tokens.shift();
  if (!executable) throw new Error('GENOS_MCP_COMMAND is empty.');
  const repositoryRoot = require('path').resolve(__dirname, '../../..');
  const workspaceRoot = process.env.GENOS_WORKSPACE_ROOT || repositoryRoot;
  const child = spawn(executable, tokens.concat(config.cmdArgs), {
    cwd: workspaceRoot,
    detached: process.platform !== 'win32',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: config.mcpTransportEnvironment(config.toolName, repositoryRoot, workspaceRoot)
  });
  const session = {
    child: child,
    timeoutMs: config.timeoutMs,
    deadlineAt: Date.now() + config.timeoutMs,
    buffer: '',
    stderr: '',
    protocolErrors: '',
    pending: null,
    closed: false,
    ioErrors: { stdin: 0, stdout: 0, stderr: 0 }
  };
  attachStdioHandlers(session);
  return session;
}

function attachStdioHandlers(session) {
  const child = session.child;
  child.stderr.on('data', (chunk) => { appendSessionStderr(session, chunk); });
  child.stdout.on('data', (chunk) => { consumeSessionStdout(session, chunk); });
  child.stdin.on('error', (error) => { onStreamError(session, 'stdin', error); });
  child.stdout.on('error', (error) => { onStreamError(session, 'stdout', error); });
  child.stderr.on('error', (error) => { onStreamError(session, 'stderr', error); });
  child.once('error', (error) => { onChildError(session, error); });
  child.once('close', (code, signal) => { onChildClose(session, code, signal); });
}

function appendSessionStderr(session, chunk) {
  session.stderr = appendBounded(session.stderr, chunk);
}

function consumeSessionStdout(session, chunk) {
  const framed = splitLines(appendBounded(session.buffer, chunk, 1024 * 1024));
  session.buffer = framed.rest;
  for (const raw of framed.lines) handleLine(session, raw);
}

function noteProtocolError(session, line) {
  session.protocolErrors = appendBounded(session.protocolErrors, 'MCP STDIO returned invalid JSON-RPC data: ' + line.slice(0, 200) + '\n');
}

function isHeaderLine(line) {
  return /^(?:content-length|content-type|host|user-agent):/i.test(line);
}

function extractJsonCandidate(line) {
  const start = line.indexOf('{');
  const end = line.lastIndexOf('}');
  return (start !== -1 && end !== -1 && end >= start) ? line.slice(start, end + 1) : line;
}

function handleLine(session, raw) {
  const line = raw.replace(/^\uFEFF/, '').trimEnd();
  if (!line) return;
  const trimmed = line.trim();
  if (isHeaderLine(trimmed) && !trimmed.includes('{')) return;
  const candidate = extractJsonCandidate(trimmed);
  let payload = null;
  try {
    payload = JSON.parse(candidate);
  } catch (_) {
    noteProtocolError(session, line);
    return;
  }
  deliverPayload(session, payload);
}

function deliverPayload(session, payload) {
  if (!session.pending) return;
  if (payload.id === undefined || payload.id === null) return;
  if (String(payload.id) !== String(session.pending.id)) return;
  const current = session.pending;
  session.pending = null;
  clearTimeout(current.timer);
  current.resolve(payload);
}

function noteIoError(session, source) {
  if (session.ioErrors[source] === undefined) return;
  session.ioErrors[source] += 1;
}

function failPending(session, error) {
  const current = session.pending;
  if (!current) return;
  session.pending = null;
  clearTimeout(current.timer);
  current.reject(error);
}

function streamError(session, source, error) {
  const count = session.ioErrors[source] || 0;
  return new Error('MCP STDIO ' + source + ' stream error (count=' + count + '): ' + error.message);
}

function onStreamError(session, source, error) {
  noteIoError(session, source);
  failPending(session, streamError(session, source, error));
}

function onChildError(session, error) {
  session.closed = true;
  failPending(session, error);
}

function closeDiagnostics(session, code, signal) {
  const name = signal || 'none';
  let text = 'MCP STDIO process exited before response (code=' + code + ', signal=' + name + ')';
  if (session.stderr) text += ': ' + session.stderr;
  if (session.protocolErrors) text += ': ' + session.protocolErrors;
  return text;
}

function onChildClose(session, code, signal) {
  session.closed = true;
  if (!session.pending) return;
  failPending(session, new Error(closeDiagnostics(session, code, signal)));
}

function describeProtocolErrors(session) {
  if (!session.protocolErrors) return '';
  return ' ' + session.protocolErrors.trim();
}

function writePayload(session, payload) {
  const line = encodeLine(payload);
  try {
    if (!session.child.stdin.writable) throw new Error('MCP STDIO stdin is not writable (EPIPE guard).');
    session.child.stdin.write(line);
  } catch (error) {
    noteIoError(session, 'stdin');
    failPending(session, streamError(session, 'stdin', error));
  }
}

function onRequestTimeout(session, id) {
  const current = session.pending;
  if (!current) return;
  if (current.id !== id) return;
  session.pending = null;
  terminateChild(session.child);
  current.reject(new Error('MCP STDIO request timed out after ' + session.timeoutMs + 'ms.' + describeProtocolErrors(session)));
}

function sendRequest(session, id, payload) {
  return new Promise((resolve, reject) => {
    if (session.closed) {
      reject(new Error('MCP STDIO process closed before the request was sent.'));
      return;
    }
    const remaining = session.deadlineAt - Date.now();
    if (remaining <= 0) {
      reject(new Error('MCP STDIO request timed out after ' + session.timeoutMs + 'ms.'));
      return;
    }
    const timer = setTimeout(() => { onRequestTimeout(session, id); }, remaining);
    session.pending = { id: id, resolve: resolve, reject: reject, timer: timer };
    writePayload(session, payload);
  });
}

function notify(session, payload) {
  writePayload(session, payload);
}

function dropPending(session) {
  if (!session.pending) return;
  clearTimeout(session.pending.timer);
  session.pending = null;
}

function endStdin(session) {
  try {
    if (session.child.stdin.destroyed) return;
    if (session.child.stdin.writable) session.child.stdin.end();
  } catch (_) {
    return;
  }
}

function shutdown(session) {
  dropPending(session);
  endStdin(session);
  if (!session.child.killed) {
    if (session.child.exitCode === null) {
      terminateChild(session.child, true);
      return;
    }
  }
  clearTerminationTimer(session.child);
}

module.exports = { startSession, sendRequest, notify, shutdown };
