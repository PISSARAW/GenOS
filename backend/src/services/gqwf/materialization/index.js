'use strict';

const contract = require('./contract');
const portableCopy = require('./portableCopy');
const reflink = require('./reflink');

function registry(options = {}) {
  const drivers = options.materializers || [portableCopy, reflink];
  const entries = new Map();
  for (const candidate of drivers) {
    const driver = contract.assertMaterializer(candidate);
    if (entries.has(driver.id)) throw new Error(`Duplicate GQWF materializer '${driver.id}'.`);
    entries.set(driver.id, driver);
  }
  if (!entries.has(portableCopy.id) && options.requirePortable !== false) {
    entries.set(portableCopy.id, portableCopy);
  }
  return entries;
}

async function inspectMaterializers(options = {}, context = {}) {
  const inspected = [];
  for (const driver of [...registry(options).values()].sort((a, b) => a.id.localeCompare(b.id))) {
    try {
      inspected.push(await contract.probe(driver, context));
    } catch (error) {
      inspected.push({ backendId: driver.id, contractVersion: driver.contractVersion,
        available: false, unavailableReason: `probe_failed:${error.message}` });
    }
  }
  return inspected;
}

function selected(driver, capabilities, selectionReason) {
  return { driver, capabilities, capabilityHash: contract.digest(capabilities), selectionReason };
}

async function selectAuto(options, context) {
  const drivers = registry(options);
  const preferred = drivers.get(reflink.id);
  let unavailableReason = 'backend_unregistered';
  if (preferred) {
    const capabilities = await contract.probe(preferred, context);
    if (capabilities.available) return selected(preferred, capabilities, 'auto_reflink');
    unavailableReason = capabilities.unavailableReason;
  }
  const fallback = drivers.get(portableCopy.id);
  if (!fallback) throw new Error('GQWF automatic materialization has no portable fallback.');
  return selected(fallback, await contract.probe(fallback, context),
    `auto_portable_fallback:${unavailableReason}`);
}

async function selectMaterializer(options = {}, context = {}) {
  if (options.materializerId === 'auto') return selectAuto(options, context);
  const requested = options.materializerId || portableCopy.id;
  const driver = registry(options).get(requested);
  if (!driver) throw new Error(`Unknown GQWF materializer '${requested}'.`);
  const capabilities = await contract.probe(driver, context);
  if (!capabilities.available) {
    throw new Error(`GQWF materializer '${requested}' is unavailable: ${capabilities.unavailableReason}.`);
  }
  return selected(driver, capabilities,
    options.materializerId ? 'explicit_backend' : 'default_portable');
}

function receiptPayload(input) {
  return {
    version: 1,
    leaseId: input.leaseId,
    workspaceId: input.workspaceId,
    rootHash: input.rootHash,
    backendId: input.selection.driver.id,
    contractVersion: input.selection.driver.contractVersion,
    capabilityHash: input.selection.capabilityHash,
    selectionReason: input.selectionReason || input.selection.selectionReason
  };
}

async function persistReceipt(db, input) {
  const payload = receiptPayload(input);
  const receiptHash = contract.digest(payload);
  await db.run(`INSERT INTO gqwf_materialization_receipts
    (lease_id, workspace_id, root_hash, backend_id, contract_version,
      capabilities_json, capability_hash, selection_reason, receipt_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, payload.leaseId, payload.workspaceId,
  payload.rootHash, payload.backendId, payload.contractVersion,
  contract.stableJson(input.selection.capabilities), payload.capabilityHash,
  payload.selectionReason, receiptHash);
  return { ...payload, capabilities: input.selection.capabilities, receiptHash };
}

function validateReceipt(row) {
  const capabilities = JSON.parse(row.capabilities_json);
  if (contract.digest(capabilities) !== row.capability_hash) {
    throw new Error('GQWF materialization capability receipt is corrupt.');
  }
  const payload = receiptPayload({
    leaseId: row.lease_id,
    workspaceId: row.workspace_id,
    rootHash: row.root_hash,
    selection: { driver: { id: row.backend_id, contractVersion: row.contract_version },
      capabilityHash: row.capability_hash, selectionReason: row.selection_reason }
  });
  if (contract.digest(payload) !== row.receipt_hash) {
    throw new Error('GQWF materialization selection receipt is corrupt.');
  }
  return { ...payload, capabilities, receiptHash: row.receipt_hash, createdAt: row.created_at };
}

async function receiptForLease(db, input) {
  const row = await db.get(`SELECT * FROM gqwf_materialization_receipts
    WHERE lease_id = ? AND workspace_id = ?`, input.leaseId, input.workspaceId);
  return row ? validateReceipt(row) : null;
}

async function resolveSelection(db, input, options = {}) {
  let receipt = await receiptForLease(db, input);
  if (!receipt) {
    const selection = await selectMaterializer({ ...options, materializerId: portableCopy.id },
      { workspacePath: input.workspacePath });
    receipt = await persistReceipt(db, { ...input, selection,
      selectionReason: 'legacy_portable_compatibility' });
  }
  if (receipt.workspaceId !== input.workspaceId || receipt.rootHash !== input.rootHash) {
    throw new Error('GQWF materialization receipt is not bound to this lease root.');
  }
  const driver = registry(options).get(receipt.backendId);
  if (!driver) throw new Error(`Recorded GQWF materializer '${receipt.backendId}' is unavailable.`);
  const capabilities = await contract.probe(driver, { workspacePath: input.workspacePath });
  if (!capabilities.available || contract.digest(capabilities) !== receipt.capabilityHash) {
    throw new Error(`Recorded GQWF materializer '${receipt.backendId}' capabilities changed.`);
  }
  return { driver, capabilities, capabilityHash: receipt.capabilityHash,
    selectionReason: receipt.selectionReason, receipt };
}

module.exports = {
  inspectMaterializers,
  persistReceipt,
  receiptForLease,
  resolveSelection,
  selectMaterializer
};
