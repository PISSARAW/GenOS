'use strict';

const { deoError, requireNonEmptyText } = require('./deoContract');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ELF_EVTX_MAGIC = Buffer.from('ElfFile\0', 'ascii');

function extractXmlAttr(fragment, attrName) {
  const match = new RegExp(`${attrName}\\s*=\\s*["']([^"']*)["']`, 'i').exec(fragment);
  return match ? match[1].trim() : null;
}

function extractXmlTagText(fragment, tagName) {
  const match = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, 'i').exec(fragment);
  return match ? match[1].trim() : null;
}

function extractEvtxDataPairs(eventXml) {
  const dataPairs = {};
  const dataRegex = /<Data\s+Name\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/Data>/gi;
  let match = dataRegex.exec(eventXml);
  while (match) {
    dataPairs[match[1].trim()] = match[2].trim();
    match = dataRegex.exec(eventXml);
  }
  return dataPairs;
}

function resolveUserFromData(dataPairs) {
  if (dataPairs.TargetUserName) return dataPairs.TargetUserName;
  if (dataPairs.SubjectUserName) return dataPairs.SubjectUserName;
  return null;
}

function resolveProcessFromData(dataPairs) {
  if (dataPairs.NewProcessName) return dataPairs.NewProcessName;
  if (dataPairs.ProcessName) return dataPairs.ProcessName;
  if (dataPairs.Image) return dataPairs.Image;
  return null;
}

function parseEvtxXmlEvent(eventXml) {
  const eventId = Number(extractXmlTagText(eventXml, 'EventID'));
  if (!Number.isInteger(eventId) || eventId <= 0) {
    throw deoError('DEO_EVTX_EVENT_ID_INVALID', 'EVTX Event lacks a valid numeric EventID.');
  }
  const timeMatch = /<TimeCreated[^>]*SystemTime\s*=\s*["']([^"']+)["']/i.exec(eventXml);
  const computer = extractXmlTagText(eventXml, 'Computer');
  if (!timeMatch || !computer) {
    throw deoError('DEO_EVTX_REQUIRED_FIELD_MISSING', 'EVTX Event requires TimeCreated[SystemTime] and Computer.');
  }
  const dataPairs = extractEvtxDataPairs(eventXml);
  return {
    recordId: extractXmlTagText(eventXml, 'EventRecordID') ?? `evtx-${eventId}`,
    eventId,
    timestamp: timeMatch[1].trim(),
    host: computer,
    channel: extractXmlTagText(eventXml, 'Channel') ?? 'Security',
    user: resolveUserFromData(dataPairs),
    process: resolveProcessFromData(dataPairs),
    data: dataPairs,
  };
}

function assertValidEvtxJsonItem(item, idx) {
  const eventId = Number(item.EventID ?? item.eventId);
  const hasRequired = Number.isInteger(eventId) && Boolean(item.TimeCreated) && Boolean(item.Computer);
  if (!hasRequired) {
    throw deoError('DEO_EVTX_SCHEMA_INVALID', `EVTX JSON record #${idx} is missing EventID, TimeCreated or Computer.`);
  }
  return eventId;
}

function mapEvtxJsonRecord(item, idx) {
  const eventId = assertValidEvtxJsonItem(item, idx);
  const data = item.EventData ?? item.data ?? {};
  return {
    recordId: String(item.EventRecordID ?? item.recordId ?? `evtx-${idx + 1}`),
    eventId,
    timestamp: String(item.TimeCreated),
    host: String(item.Computer),
    channel: String(item.Channel ?? 'Security'),
    user: item.user ?? resolveUserFromData(data),
    process: item.process ?? resolveProcessFromData(data),
    data,
  };
}

function parseEvtxJsonText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw deoError('DEO_CORRUPTED_ARTIFACT', `Corrupted EVTX JSON export: ${err.message}`);
  }
  const items = Array.isArray(parsed) ? parsed : parsed.events;
  if (!Array.isArray(items) || items.length === 0) {
    throw deoError('DEO_INCOMPLETE_EXPORT', 'EVTX JSON export contains no events array.');
  }
  return items.map(mapEvtxJsonRecord);
}

function countOccurrences(text, token) {
  return text.split(token).length - 1;
}

function assertBalancedEvtxTags(text) {
  const hasEventTags = text.includes('<Event') && text.includes('</Event>');
  if (!hasEventTags) {
    throw deoError('DEO_CORRUPTED_ARTIFACT', 'EVTX XML stream is missing complete <Event>...</Event> tags.');
  }
  const openCount = countOccurrences(text, '<Event>') + countOccurrences(text, '<Event ');
  const closeCount = countOccurrences(text, '</Event>');
  if (openCount !== closeCount) {
    throw deoError('DEO_INCOMPLETE_EXPORT', 'Truncated EVTX XML export: unbalanced <Event> tags.');
  }
}

function parseEvtxXmlText(text) {
  assertBalancedEvtxTags(text);
  const records = [];
  const regex = new RegExp('<Event(?:\\s[^>]*)?>([\\s\\S]*?)</Event>', 'gi');
  let match = regex.exec(text);
  while (match) {
    records.push(parseEvtxXmlEvent(match[1]));
    match = regex.exec(text);
  }
  return records;
}

function parseEvtxPayload(rawBytes) {
  if (rawBytes.length >= 8 && rawBytes.subarray(0, 8).equals(ELF_EVTX_MAGIC)) {
    return parseBinaryEvtx(rawBytes);
  }
  const text = rawBytes.toString('utf8').trim();
  if (text.startsWith('{') || text.startsWith('[')) {
    return parseEvtxJsonText(text);
  }
  return parseEvtxXmlText(text);
}

function parseBinaryEvtx(rawBytes) {
  if (process.platform !== 'win32') {
    throw deoError('DEO_EVTX_BINARY_PARSER_UNAVAILABLE', 'Binary EVTX parsing requires the Windows Event Log utility.');
  }
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'genos-deo-evtx-'));
  const filePath = path.join(tempDir, 'evidence.evtx');
  try {
    writeFileSync(filePath, rawBytes, { flag: 'wx' });
    const xml = execFileSync('wevtutil.exe', ['qe', filePath, '/lf:true', '/f:xml'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      timeout: 120000,
      maxBuffer: 128 * 1024 * 1024,
    }).trim();
    return parseEvtxXmlText(xml);
  } catch (err) {
    if (err.code?.startsWith('DEO_')) throw err;
    throw deoError('DEO_CORRUPTED_ARTIFACT', `Windows rejected or could not fully export binary EVTX: ${err.message}`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function extractNmapPorts(hostXml) {
  const ports = [];
  const portRegex = /<port\s+([^>]*)>([\s\S]*?)<\/port>/gi;
  let match = portRegex.exec(hostXml);
  while (match) {
    const stateMatch = /<state[^>]*state\s*=\s*["']([^"']+)["']/i.exec(match[2]);
    const serviceMatch = /<service[^>]*name\s*=\s*["']([^"']+)["']/i.exec(match[2]);
    ports.push({
      portId: Number(extractXmlAttr(match[1], 'portid')),
      protocol: extractXmlAttr(match[1], 'protocol') ?? 'tcp',
      state: stateMatch ? stateMatch[1] : 'unknown',
      service: serviceMatch ? serviceMatch[1] : 'unknown',
    });
    match = portRegex.exec(hostXml);
  }
  return ports;
}

function extractNmapHostIdentity(hostXml) {
  const addrMatch = /<address[^>]*addr\s*=\s*["']([^"']+)["']/i.exec(hostXml);
  const hostnameMatch = /<hostname[^>]*name\s*=\s*["']([^"']+)["']/i.exec(hostXml);
  const address = addrMatch ? addrMatch[1] : null;
  const host = (hostnameMatch ? hostnameMatch[1] : null) ?? address;
  if (!host) {
    throw deoError('DEO_NMAP_HOST_MISSING', 'Nmap <host> block has neither address nor hostname.');
  }
  return { host, address: address ?? host };
}

function parseNmapHostBlock(hostXml, defaultTime) {
  const identity = extractNmapHostIdentity(hostXml);
  const startTimeSec = Number(extractXmlAttr(hostXml, 'starttime'));
  const timestamp = startTimeSec > 0 ? new Date(startTimeSec * 1000).toISOString() : defaultTime;
  return { ...identity, timestamp, ports: extractNmapPorts(hostXml) };
}

function extractNmapDefaultTime(text) {
  const runHeader = /<nmaprun([^>]*)>/i.exec(text);
  const startAttr = runHeader ? Number(extractXmlAttr(runHeader[1], 'start')) : NaN;
  if (startAttr > 0) {
    return new Date(startAttr * 1000).toISOString();
  }
  const startIso = runHeader ? extractXmlAttr(runHeader[1], 'startstr') : null;
  if (!startIso) {
    throw deoError('DEO_NMAP_TIMESTAMP_MISSING', 'Nmap <nmaprun> requires a valid start timestamp.');
  }
  return startIso;
}

function parseNmapXmlPayload(rawBytes) {
  const text = rawBytes.toString('utf8').trim();
  if (!text.includes('<nmaprun')) {
    throw deoError('DEO_CORRUPTED_ARTIFACT', 'Invalid Nmap XML: missing <nmaprun> root element.');
  }
  if (!text.includes('</nmaprun>')) {
    throw deoError('DEO_INCOMPLETE_EXPORT', 'Incomplete Nmap XML export: missing closing </nmaprun> tag.');
  }
  const defaultTime = extractNmapDefaultTime(text);
  const hosts = [];
  const hostRegex = /<host(?:\s[^>]*)?>([\s\S]*?)<\/host>/gi;
  let match = hostRegex.exec(text);
  while (match) {
    hosts.push(parseNmapHostBlock(match[1], defaultTime));
    match = hostRegex.exec(text);
  }
  if (hosts.length === 0) {
    throw deoError('DEO_INCOMPLETE_EXPORT', 'Nmap XML contains no <host> records.');
  }
  return hosts;
}

function splitCsvRow(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (inQuotes) {
    throw deoError('DEO_CORRUPTED_ARTIFACT', 'Malformed CSV row: unterminated quoted field.');
  }
  cells.push(current.trim());
  return cells;
}

function mapHayabusaRow(headers, line, index) {
  const values = splitCsvRow(line);
  if (values.length !== headers.length) {
    throw deoError('DEO_INCOMPLETE_EXPORT', `Hayabusa CSV row #${index + 1} column count mismatch.`);
  }
  const row = Object.fromEntries(headers.map((h, i) => [h, values[i]]));
  return {
    rowNumber: index + 1,
    timestamp: row.timestamp,
    host: row.computer,
    level: row.level,
    ruleTitle: row.ruletitle,
    eventId: Number(row.eventid),
    channel: row.channel || 'Security',
    user: row.user || null,
    process: row.process || row.image || null,
    details: row.details || '',
  };
}

function parseHayabusaCsvPayload(rawBytes) {
  const text = rawBytes.toString('utf8').replace(/\r\n/g, '\n').trim();
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw deoError('DEO_INCOMPLETE_EXPORT', 'Hayabusa CSV requires a header row and at least one event row.');
  }
  const headers = splitCsvRow(lines[0]).map((h) => h.toLowerCase());
  const required = ['timestamp', 'computer', 'level', 'ruletitle', 'eventid'];
  for (const req of required) {
    if (!headers.includes(req)) {
      throw deoError('DEO_CORRUPTED_ARTIFACT', `Hayabusa CSV missing required column '${req}'.`);
    }
  }
  return lines.slice(1).map((line, idx) => mapHayabusaRow(headers, line, idx));
}

function parseGpoXmlPolicy(blockXml, rootMeta, index) {
  const settingName = extractXmlTagText(blockXml, 'Name');
  if (!settingName) {
    throw deoError('DEO_CORRUPTED_ARTIFACT', 'GPO <Policy> block missing <Name>.');
  }
  return {
    gpoName: rootMeta.gpoName,
    domain: rootMeta.domain,
    host: extractXmlTagText(blockXml, 'Computer') ?? rootMeta.domain,
    timestamp: rootMeta.readTime,
    policyPath: extractXmlTagText(blockXml, 'Category') ?? 'Machine/Security',
    settingName,
    state: extractXmlTagText(blockXml, 'State') ?? 'Enabled',
    user: extractXmlTagText(blockXml, 'User') ?? null,
    index,
  };
}

function extractGpoXmlRootMeta(text) {
  const gpoName = extractXmlTagText(text, 'Name');
  const domain = extractXmlTagText(text, 'Domain') ?? extractXmlTagText(text, 'DomainName');
  const readTime = extractXmlTagText(text, 'ReadTime') ?? extractXmlTagText(text, 'CreatedTime');
  const hasAll = Boolean(gpoName) && Boolean(domain) && Boolean(readTime);
  if (!hasAll) {
    throw deoError('DEO_INCOMPLETE_EXPORT', 'GPO XML report missing Name, Domain, or ReadTime.');
  }
  return { gpoName, domain, readTime };
}

function parseGpoXml(text) {
  if (!text.includes('<GPO') || !text.includes('</GPO>')) {
    throw deoError('DEO_CORRUPTED_ARTIFACT', 'Invalid GPO XML report: missing <GPO>...</GPO> root.');
  }
  const rootMeta = extractGpoXmlRootMeta(text);
  const policies = [];
  const policyRegex = /<Policy(?:\s[^>]*)?>([\s\S]*?)<\/Policy>/gi;
  let match = policyRegex.exec(text);
  while (match) {
    policies.push(parseGpoXmlPolicy(match[1], rootMeta, policies.length));
    match = policyRegex.exec(text);
  }
  if (!policies.length) {
    throw deoError('DEO_INCOMPLETE_EXPORT', 'GPO XML report contains no <Policy> entries.');
  }
  return policies;
}

function validateGpoJsonRoot(parsed) {
  const hasFields = Boolean(parsed?.gpoName) && Boolean(parsed?.domain) && Boolean(parsed?.generatedAt);
  if (!hasFields || !Array.isArray(parsed?.settings) || parsed.settings.length === 0) {
    throw deoError('DEO_INCOMPLETE_EXPORT', 'GPO JSON report requires gpoName, domain, generatedAt, and non-empty settings.');
  }
}

function parseGpoJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw deoError('DEO_CORRUPTED_ARTIFACT', `Corrupted GPO JSON report: ${err.message}`);
  }
  validateGpoJsonRoot(parsed);
  return parsed.settings.map((setting, idx) => ({
    gpoName: String(parsed.gpoName),
    domain: String(parsed.domain),
    host: String(setting.host ?? parsed.host ?? parsed.domain),
    timestamp: String(setting.timestamp ?? parsed.generatedAt),
    policyPath: requireNonEmptyText(setting.policyPath, 'DEO_GPO_POLICY_PATH_REQUIRED'),
    settingName: requireNonEmptyText(setting.settingName, 'DEO_GPO_SETTING_REQUIRED'),
    state: String(setting.state ?? 'Configured'),
    user: setting.principal ?? parsed.user ?? null,
    index: idx,
  }));
}

function parseGpoReportPayload(rawBytes) {
  const text = rawBytes.toString('utf8').trim();
  return text.startsWith('{') ? parseGpoJson(text) : parseGpoXml(text);
}

module.exports = {
  parseEvtxPayload,
  parseNmapXmlPayload,
  parseHayabusaCsvPayload,
  parseGpoReportPayload,
};
