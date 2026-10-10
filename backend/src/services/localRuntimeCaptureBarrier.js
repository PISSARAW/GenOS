let request = null;
let release = null;

process.on('message', (message) => {
  if (message?.type === 'genos-snapshot-pause' && typeof message.nonce === 'string') {
    if (!request) request = message.nonce;
  } else if (message?.type === 'genos-snapshot-resume' && message.nonce === request) {
    request = null;
    const done = release;
    release = null;
    if (done) done();
  }
});

process.on('disconnect', () => {
  request = null;
  const done = release;
  release = null;
  if (done) done();
});

async function safePoint(phase) {
  if (!process.connected || !request) return;
  const nonce = request;
  await new Promise((resolve) => {
    release = resolve;
    process.send({ type: 'genos-snapshot-paused', nonce, phase }, (error) => {
      if (error) {
        request = null;
        release = null;
        resolve();
      }
    });
  });
}

module.exports = { safePoint };
