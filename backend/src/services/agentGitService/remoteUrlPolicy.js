const { validateProviderEndpointAsync } = require('../providerEndpointPolicy');

// Agent Git remotes are fetched server-side, so a caller-controlled remoteUrl
// is an SSRF vector. Reuse the provider endpoint policy (blocks loopback,
// private ranges and metadata addresses) unless an operator explicitly opts
// into private remotes for a trusted self-hosted topology.
const PRIVATE_HOST_PATTERN = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|::1)$/i;

function validateRemoteUrlHost(url) {
  const parsed = new URL(String(url));
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Invalid protocol: must be http or https.');
  }
  const host = parsed.hostname.toLowerCase();
  if (process.env.GENOS_AGENT_GIT_ALLOW_PRIVATE_REMOTES !== '1') {
    if (PRIVATE_HOST_PATTERN.test(host) || host.endsWith('.local') || host === 'localhost') {
      throw new Error('Blocked: loopback, private, and metadata addresses are prohibited.');
    }
  }
  return parsed;
}

async function assertRemoteGitUrl(rawUrl) {
  validateRemoteUrlHost(rawUrl);
  if (process.env.GENOS_AGENT_GIT_ALLOW_PRIVATE_REMOTES === '1') return;
  await validateProviderEndpointAsync(String(rawUrl), { localOnly: false });
}

module.exports = {
  validateRemoteUrlHost,
  assertRemoteGitUrl,
  PRIVATE_HOST_PATTERN
};
