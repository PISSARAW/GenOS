const BLOCKED_HOSTNAMES = /^(?:localhost|.*\.local|.*\.internal|metadata(?:\.google\.internal)?|metadata\.amazonaws\.com)$/i;

function isLoopbackHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '::1' || /^127\./.test(host) || host === '0.0.0.0';
}

function isBlockedAddress(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTNAMES.test(host)) return true;
  if (/^169\.254\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d+)\./);
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
}

function validateProviderEndpoint(rawEndpoint, { localOnly = false } = {}) {
  let parsed;
  try { parsed = new URL(String(rawEndpoint || '')); } catch (_) { throw new Error('Provider endpoint must be a valid absolute URL.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Provider endpoint must use HTTP or HTTPS.');
  if (parsed.username || parsed.password) throw new Error('Provider endpoint must not embed credentials.');
  if (localOnly && !isLoopbackHostname(parsed.hostname)) throw new Error('Local provider endpoint must target loopback.');
  if (!localOnly && isBlockedAddress(parsed.hostname) && !isLoopbackHostname(parsed.hostname)) throw new Error('Provider endpoint targets a blocked private or metadata address.');
  return parsed;
}

module.exports = { validateProviderEndpoint, isLoopbackHostname, isBlockedAddress };
