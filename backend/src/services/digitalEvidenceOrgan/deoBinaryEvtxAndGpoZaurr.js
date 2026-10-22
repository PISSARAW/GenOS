'use strict';

const { deoError, requireNonEmptyText } = require('./deoContract');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ELF_EVTX_MAGIC = Buffer.from('ElfFile\0', 'ascii');
const ELF_CHNK_MAGIC = Buffer.from('ElfChnk\0', 'ascii');
const EVTX_HEADER_BLOCK_SIZE = 4096;
const EVTX_CHUNK_SIZE = 65536;
const EVTX_RECORD_MAGIC = 0x00002a2a;

function buildEvtxEventXml(event, index) {
  const recordId = event.recordId ?? index + 1;
  const eventId = Number(event.eventId ?? 4624);
  const timestamp = event.timestamp ?? '2026-10-22T10:00:00Z';
  const computer = event.host ?? event.computer ?? 'SRV-FIN-02.cybercorp.local';
  const channel = event.channel ?? 'Security';
  const dataEntries = Object.entries(event.data ?? {})
    .map(([k, v]) => `<Data Name="${k}">${v}</Data>`)
    .join('');
  return `<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event"><System><Provider Name="Microsoft-Windows-Security-Auditing"/><EventID>${eventId}</EventID><EventRecordID>${recordId}</EventRecordID><TimeCreated SystemTime="${timestamp}"/><Computer>${computer}</Computer><Channel>${channel}</Channel></System><EventData>${dataEntries}</EventData></Event>`;
}

function writeBinaryEvtxRecord(recordContext) {
  const { chunkBuf, offset, recordSpec, index } = recordContext;
  const xmlPayload = Buffer.from(buildEvtxEventXml(recordSpec, index), 'utf8');
  const bodyLen = 24 + xmlPayload.length + 4;
  const alignedLen = Math.ceil(bodyLen / 8) * 8;
  chunkBuf.writeUInt32LE(EVTX_RECORD_MAGIC, offset);
  chunkBuf.writeUInt32LE(alignedLen, offset + 4);
  chunkBuf.writeBigUInt64LE(BigInt(recordSpec.recordId ?? index + 1), offset + 8);
  const epochMs = Date.parse(recordSpec.timestamp ?? '2026-10-22T10:00:00Z');
  const filetime = BigInt(epochMs + 11644473600000) * 10000n;
  chunkBuf.writeBigUInt64LE(filetime, offset + 16);
  xmlPayload.copy(chunkBuf, offset + 24);
  chunkBuf.writeUInt32LE(alignedLen, offset + alignedLen - 4);
  return offset + alignedLen;
}

function buildBinaryEvtxBuffer(events = []) {
  if (!Array.isArray(events) || events.length === 0) {
    throw deoError('DEO_INCOMPLETE_EXPORT', 'buildBinaryEvtxBuffer requires at least one event.');
  }
  const header = Buffer.alloc(EVTX_HEADER_BLOCK_SIZE, 0);
  ELF_EVTX_MAGIC.copy(header, 0);
  header.writeBigUInt64LE(0n, 8);
  header.writeBigUInt64LE(0n, 16);
  header.writeBigUInt64LE(BigInt(events.length + 1), 24);
  header.writeUInt32LE(128, 32);
  header.writeUInt16LE(1, 36);
  header.writeUInt16LE(3, 38);
  header.writeUInt16LE(EVTX_HEADER_BLOCK_SIZE, 40);
  header.writeUInt16LE(1, 42);

  const chunk = Buffer.alloc(EVTX_CHUNK_SIZE, 0);
  ELF_CHNK_MAGIC.copy(chunk, 0);
  chunk.writeBigUInt64LE(1n, 8);
  chunk.writeBigUInt64LE(BigInt(events.length), 16);
  chunk.writeBigUInt64LE(1n, 24);
  chunk.writeBigUInt64LE(BigInt(events.length), 32);
  chunk.writeUInt32LE(512, 40);

  let writeOffset = 512;
  for (let i = 0; i < events.length; i += 1) {
    writeOffset = writeBinaryEvtxRecord({ chunkBuf: chunk, offset: writeOffset, recordSpec: events[i], index: i });
  }
  chunk.writeUInt32LE(writeOffset, 48);
  return Buffer.concat([header, chunk]);
}

function assertValidEvtxChunk(chunkBuf) {
  if (chunkBuf.length < 512 || !chunkBuf.subarray(0, 8).equals(ELF_CHNK_MAGIC)) {
    throw deoError('DEO_CORRUPTED_ARTIFACT', 'Binary EVTX chunk missing valid ElfChnk\\0 header.');
  }
}

function extractOneEvtxRecord(chunkBuf, offset, parseSingleEventXml) {
  if (chunkBuf.readUInt32LE(offset) !== EVTX_RECORD_MAGIC) return { nextOffset: null };
  const recSize = chunkBuf.readUInt32LE(offset + 4);
  if (recSize < 28 || offset + recSize > chunkBuf.length) {
    throw deoError('DEO_CORRUPTED_ARTIFACT', 'Binary EVTX record size out of chunk bounds.');
  }
  const xmlStr = chunkBuf.subarray(offset + 24, offset + recSize - 4).toString('utf8').replace(/\0+$/g, '').trim();
  const event = /<Event(?:\s[^>]*)?>([\s\S]*?)<\/Event>/i.exec(xmlStr);
  return { record: event ? parseSingleEventXml(event[1]) : null, nextOffset: offset + recSize };
}

function extractRecordsFromEvtxChunk(chunkBuf, parseSingleEventXml) {
  assertValidEvtxChunk(chunkBuf);
  const firstRecId = Number(chunkBuf.readBigUInt64LE(24));
  const lastRecId = Number(chunkBuf.readBigUInt64LE(32));
  const declaredCount = lastRecId >= firstRecId && firstRecId > 0 ? (lastRecId - firstRecId + 1) : 0;
  const freeSpaceOffset = chunkBuf.readUInt32LE(48) || chunkBuf.length;
  const records = [];
  let offset = 512;
  while (offset + 28 <= Math.min(freeSpaceOffset, chunkBuf.length)) {
    const parsed = extractOneEvtxRecord(chunkBuf, offset, parseSingleEventXml);
    if (parsed.nextOffset === null) break;
    if (parsed.record) records.push(parsed.record);
    offset = parsed.nextOffset;
  }
  return { records, declaredCount };
}

function tryWevtutilExport(rawBytes, parseXmlText) {
  if (process.platform !== 'win32') {
    throw deoError('DEO_CORRUPTED_ARTIFACT', 'Binary EVTX chunk contains no readable records and wevtutil is unavailable.');
  }
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'genos-deo-evtx-'));
  const filePath = path.join(tempDir, 'evidence.evtx');
  try {
    writeFileSync(filePath, rawBytes, { flag: 'wx' });
    const xml = execFileSync('wevtutil.exe', ['qe', filePath, '/lf:true', '/f:xml'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      timeout: 30000,
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
    return parseXmlText(xml);
  } catch (err) {
    if (err.code?.startsWith('DEO_')) throw err;
    throw deoError('DEO_CORRUPTED_ARTIFACT', `Windows rejected or could not export binary EVTX: ${err.message}`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function parseBinaryEvtxWithFidelity(rawBytes, parseSingleEventXml, parseXmlText) {
  if (rawBytes.length < EVTX_HEADER_BLOCK_SIZE + 512) {
    throw deoError('DEO_CORRUPTED_ARTIFACT', 'Truncated binary EVTX: smaller than header + chunk header.');
  }
  const chunkCount = rawBytes.readUInt16LE(42);
  if (chunkCount < 1) {
    throw deoError('DEO_CORRUPTED_ARTIFACT', 'Binary EVTX header declares zero chunks.');
  }
  const allRecords = [];
  let totalDeclared = 0;
  for (let c = 0; c < chunkCount; c += 1) {
    const chunkStart = EVTX_HEADER_BLOCK_SIZE + c * EVTX_CHUNK_SIZE;
    if (chunkStart + 512 > rawBytes.length) break;
    const chunkSlice = rawBytes.subarray(chunkStart, Math.min(chunkStart + EVTX_CHUNK_SIZE, rawBytes.length));
    const { records, declaredCount } = extractRecordsFromEvtxChunk(chunkSlice, parseSingleEventXml);
    allRecords.push(...records);
    totalDeclared += declaredCount;
  }
  if (allRecords.length > 0) {
    Object.defineProperty(allRecords, '_declaredCount', { value: totalDeclared || allRecords.length, enumerable: false });
    return allRecords;
  }
  return tryWevtutilExport(rawBytes, parseXmlText);
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function textValue(...values) {
  return String(firstPresent(...values));
}

function mapGpoZaurrEntry(item, rootMeta, idx) {
  return {
    gpoName: textValue(item.GPOName, rootMeta.gpoName),
    domain: textValue(item.DomainName, rootMeta.domain),
    host: textValue(item.Computer, item.TargetOU, rootMeta.host, rootMeta.domain),
    timestamp: textValue(item.Timestamp, rootMeta.generatedAt),
    policyPath: requireNonEmptyText(firstPresent(item.PolicyPath, item.Category, 'Computer/SecuritySettings'), 'DEO_GPO_POLICY_PATH_REQUIRED'),
    settingName: requireNonEmptyText(firstPresent(item.SettingName, item.Finding, item.Name), 'DEO_GPO_SETTING_REQUIRED'),
    state: textValue(item.State, item.Status, 'Configured'),
    user: firstPresent(item.Principal, item.Trustee, rootMeta.user) ?? null,
    index: idx,
  };
}

function findGpoZaurrFields(parsed) {
  return {
    gpoName: firstPresent(parsed.GPOName, parsed.gpoName, parsed.ReportMetadata?.GPOName),
    domain: firstPresent(parsed.DomainName, parsed.domain, parsed.ReportMetadata?.DomainName),
    generatedAt: firstPresent(parsed.GeneratedAt, parsed.generatedAt, parsed.ReportMetadata?.GeneratedAt),
    entries: firstPresent(parsed.GPOSettings, parsed.Findings, parsed.settings),
  };
}

function parseGpoZaurrJson(parsed) {
  const { gpoName, domain, generatedAt, entries } = findGpoZaurrFields(parsed);
  if (!gpoName || !domain || !generatedAt || !Array.isArray(entries) || entries.length === 0) {
    throw deoError('DEO_INCOMPLETE_EXPORT', 'GPO/GPOZaurr JSON report requires GPOName, DomainName, GeneratedAt, and settings/findings.');
  }
  const rootMeta = { gpoName, domain, generatedAt, host: parsed.Host ?? parsed.host, user: parsed.User ?? parsed.user };
  const mapped = entries.map((entry, idx) => mapGpoZaurrEntry(entry, rootMeta, idx));
  Object.defineProperty(mapped, '_declaredCount', { value: Number(parsed.DeclaredSettingCount ?? entries.length), enumerable: false });
  return mapped;
}

function computeExtractionFidelity(parsedRecords, normalizedCount, duplicateCount) {
  const extractedRecordCount = Array.isArray(parsedRecords) ? parsedRecords.length : 0;
  const declaredRecordCount = Number(parsedRecords?._declaredCount ?? extractedRecordCount);
  const lostEventCount = Math.max(0, declaredRecordCount - extractedRecordCount);
  const fidelityRate = declaredRecordCount > 0
    ? Number((extractedRecordCount / declaredRecordCount).toFixed(4))
    : 1;
  return Object.freeze({
    declaredRecordCount,
    extractedRecordCount,
    normalizedObservationCount: normalizedCount,
    duplicateRecordCount: duplicateCount,
    lostEventCount,
    fidelityRate,
    completeExtraction: lostEventCount === 0 && extractedRecordCount > 0,
  });
}

module.exports = {
  ELF_EVTX_MAGIC,
  ELF_CHNK_MAGIC,
  buildBinaryEvtxBuffer,
  parseBinaryEvtxWithFidelity,
  parseGpoZaurrJson,
  computeExtractionFidelity,
};
