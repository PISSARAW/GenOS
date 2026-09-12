const assert = require('node:assert/strict');
const dns = require('node:dns').promises;

const originalLookup = dns.lookup;
const answers = {
  'public.example': [{ address: '93.184.216.34', family: 4 }],
  'internal.example': [{ address: '127.0.0.1', family: 4 }],
  'v6.example': [{ address: '::ffff:7f00:1', family: 6 }],
  'meta.example': [{ address: '169.254.169.254', family: 4 }]
};
dns.lookup = async (hostname) => answers[hostname] || [];

const webhooks = require('../src/services/webhookService');

(async () => {
  const target = await webhooks.resolvePublicWebhookTarget('https://public.example/hook');
  assert.equal(target.address, '93.184.216.34');
  assert.equal(target.port, 443);

  for (const url of ['http://public.example/hook', 'https://user:pass@public.example/hook', 'https://localhost/hook', 'https://internal.example/hook', 'https://v6.example/hook', 'https://meta.example/hook']) {
    await assert.rejects(() => webhooks.assertPublicWebhookUrl(url), /Webhook|private|reserved|internal/i, `must reject ${url}`);
  }

  console.log('Webhook SSRF/rebinding checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => { dns.lookup = originalLookup; });
