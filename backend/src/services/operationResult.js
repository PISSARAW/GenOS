'use strict';

function base(status, data = {}) {
  return {
    success: status === 'completed',
    status,
    simulated: status === 'simulated',
    fallbackUsed: false,
    ...data,
  };
}

function completed(data = {}) {
  return base('completed', data);
}

function failed(error, data = {}) {
  const message = error instanceof Error ? error.message : String(error || 'Operation failed.');
  return base('failed', { ...data, error: message });
}

function simulated(data = {}) {
  return base('simulated', data);
}

function fallback(data = {}) {
  return { ...base('fallback', data), fallbackUsed: true };
}

module.exports = { completed, failed, simulated, fallback };
