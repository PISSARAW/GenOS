/**
 * Defensive telemetry fanout — one throwing listener must never break emit()
 * nor skip webhook dispatch. Webhook dispatch runs in a `finally` so it is
 * always attempted, even when a listener throws.
 */

function emitToListeners(emitter, eventName, event) {
  const errors = [];
  for (const listener of emitter.listeners(eventName)) {
    try {
      listener(event);
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

function reportListenerErrors(errors) {
  if (errors.length) console.warn(`[TelemetryObserver] ${errors.length} telemetry listener(s) threw; webhook dispatch continues.`);
}

function fanout(emitter, webhook, event) {
  try {
    reportListenerErrors(emitToListeners(emitter, 'telemetry', event));
  } finally {
    webhook.dispatch(event);
  }
}

module.exports = { emitToListeners, fanout };
