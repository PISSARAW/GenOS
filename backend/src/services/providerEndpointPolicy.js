const BLOCKED_HOSTNAMES = /^(?:localhost|.*\.local|.*\.internal|metadata(?:\.google\.internal)?|metadata\.amazonaws\.com)$/i;
const METADATA_ADDRESSES = new Set(['100.100.100.200']);
const BLOCKED_FIRST_OCTETS = new Set([0, 10]);
const dns = require('dns').promises;

function stripBrackets(hostname) {
  return String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
}

function parseIpv4Part(part) {
  if (/^0x[0-9a-f]+$/.test(part)) return parseInt(part, 16);
  if (/^0[0-7]+$/.test(part)) return parseInt(part, 8);
  if (/^\d+$/.test(part)) return parseInt(part, 10);
  return null;
}

function ipv4FromValue(value) {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
}

function parseIpv4Literal(host) {
  const parts = host.split('.');
  const count = parts.length;
  if (count < 1 || count > 4) return null;
  const values = [];
  for (const part of parts) {
    const value = parseIpv4Part(part);
    if (value === null) return null;
    values.push(value);
  }
  const lastMax = [0xffffffff, 0xffffff, 0xffff, 0xff][count - 1];
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const isLast = i === count - 1;
    if (values[i] > (isLast ? lastMax : 0xff)) return null;
    total += values[i] * (2 ** (isLast ? 0 : 24 - 8 * i));
  }
  return ipv4FromValue(total);
}

function ipv6WithoutZone(host) {
  const zone = host.indexOf('%');
  return zone === -1 ? host : host.slice(0, zone);
}

function convertIpv4Tail(text) {
  const lastColon = text.lastIndexOf(':');
  if (text.indexOf('.') < lastColon) return text;
  const ipv4 = parseIpv4Literal(text.slice(lastColon + 1));
  if (!ipv4) return null;
  const octets = ipv4.split('.').map(Number);
  const high = ((octets[0] << 8) | octets[1]).toString(16);
  const low = ((octets[2] << 8) | octets[3]).toString(16);
  return `${text.slice(0, lastColon + 1)}${high}:${low}`;
}

function splitGroupText(section) {
  return section ? section.split(':') : [];
}

function parseGroupList(parts) {
  const groups = [];
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    groups.push(parseInt(part, 16));
  }
  return groups;
}

function ipv6Sections(text) {
  const gap = text.indexOf('::');
  if (gap < 0) return { gap: false, head: splitGroupText(text), tail: [] };
  return { gap: true, head: splitGroupText(text.slice(0, gap)), tail: splitGroupText(text.slice(gap + 2)) };
}

function parseIpv6(hostname) {
  const base = ipv6WithoutZone(stripBrackets(hostname));
  if (base.indexOf(':') === -1) return null;
  const converted = convertIpv4Tail(base);
  if (!converted) return null;
  const sections = ipv6Sections(converted);
  const head = parseGroupList(sections.head);
  const tail = parseGroupList(sections.tail);
  if (!head || !tail) return null;
  const fill = 8 - head.length - tail.length;
  if (sections.gap) { if (fill < 1) return null; } else if (fill !== 0) return null;
  return head.concat(new Array(fill).fill(0), tail);
}

function isZeroRange(groups, start, end) {
  for (let i = start; i < end; i += 1) if (groups[i] !== 0) return false;
  return true;
}

function isMappedIpv4(groups) {
  return groups[5] === 0xffff && isZeroRange(groups, 0, 5);
}

function isTranslatedIpv4(groups) {
  return groups[4] === 0xffff && groups[5] === 0 && isZeroRange(groups, 0, 4);
}

function isNat64Ipv4(groups) {
  return groups[0] === 0x64 && groups[1] === 0xff9b && isZeroRange(groups, 2, 6);
}

function isCompatibleIpv4(groups) {
  if (!isZeroRange(groups, 0, 6)) return false;
  return !isZeroRange(groups, 0, 7) || groups[7] > 1;
}

function embeddedIpv4(groups) {
  const embedded = isMappedIpv4(groups) || isTranslatedIpv4(groups) || isNat64Ipv4(groups) || isCompatibleIpv4(groups);
  if (!embedded) return null;
  return ipv4FromValue(((groups[6] << 16) | groups[7]) >>> 0);
}

function normalizeIpv4(hostname) {
  const host = stripBrackets(hostname);
  const literal = parseIpv4Literal(host);
  if (literal) return literal;
  const groups = parseIpv6(host);
  return groups ? embeddedIpv4(groups) : null;
}

function normalizeHost(hostname) {
  const host = stripBrackets(hostname);
  return { host, ipv4: normalizeIpv4(host) };
}

function isIpv6Loopback(host) {
  const groups = parseIpv6(host);
  return Boolean(groups) && groups[7] === 1 && isZeroRange(groups, 0, 7);
}

function isLoopbackHostname(hostname) {
  const normalized = normalizeHost(hostname);
  if (normalized.host === 'localhost') return true;
  if (normalized.ipv4) return /^127\./.test(normalized.ipv4);
  return isIpv6Loopback(normalized.host);
}

function isBlockedIpv4(ipv4) {
  if (METADATA_ADDRESSES.has(ipv4)) return true;
  const [a, b] = ipv4.split('.').map(Number);
  if (BLOCKED_FIRST_OCTETS.has(a)) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  return a === 172 && b >= 16 && b <= 31;
}

function isBlockedIpv6(host) {
  const groups = parseIpv6(host);
  if (!groups) return false;
  if (isZeroRange(groups, 0, 8)) return true;
  if ((groups[0] & 0xffc0) === 0xfe80) return true;
  return (groups[0] & 0xfe00) === 0xfc00;
}

function isBlockedAddress(hostname) {
  const normalized = normalizeHost(hostname);
  if (BLOCKED_HOSTNAMES.test(normalized.host)) return true;
  if (normalized.ipv4) return isBlockedIpv4(normalized.ipv4);
  return isBlockedIpv6(normalized.host);
}

function isBlockedForRemote(hostname) {
  return isBlockedAddress(hostname) || isLoopbackHostname(hostname);
}

function validateProviderEndpoint(rawEndpoint, { localOnly = false } = {}) {
  let parsed;
  try { parsed = new URL(String(rawEndpoint || '')); } catch (_) { throw new Error('Provider endpoint must be a valid absolute URL.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Provider endpoint must use HTTP or HTTPS.');
  if (parsed.username || parsed.password) throw new Error('Provider endpoint must not embed credentials.');
  if (localOnly && !isLoopbackHostname(parsed.hostname)) throw new Error('Local provider endpoint must target loopback.');
  if (!localOnly && isBlockedForRemote(parsed.hostname)) throw new Error('Provider endpoint targets a blocked loopback, private, or metadata address.');
  return parsed;
}

async function validateProviderEndpointAsync(rawEndpoint, options = {}) {
  const parsed = validateProviderEndpoint(rawEndpoint, options);
  if (isLoopbackHostname(parsed.hostname) || isBlockedAddress(parsed.hostname)) return parsed;
  try {
    const addresses = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
    if (addresses.some(({ address }) => isBlockedAddress(address) || isLoopbackHostname(address))) {
      throw new Error('Provider endpoint resolves to a blocked private, loopback, or metadata address.');
    }
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') throw new Error('Provider endpoint hostname could not be resolved.');
    throw error;
  }
  return parsed;
}

module.exports = { validateProviderEndpoint, validateProviderEndpointAsync, isLoopbackHostname, isBlockedAddress };
