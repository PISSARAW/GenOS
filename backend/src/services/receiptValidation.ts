/**
 * Receipt validation utilities (TypeScript)
 * Uses schema from ../shared/receiptSchema.ts
 */

import {
  AnyReceipt,
  ReceiptKind,
  RECEIPT_KINDS,
  RECEIPT_SCHEMA_VERSION,
  ReceiptStatus,
  validateReceiptSchema,
  canonicalJson,
  generateReceiptId,
  migrateReceipt,
} from '../shared/receiptSchema';

/**
 * Validate and normalize a receipt
 */
export function validateAndNormalizeReceipt(receipt: AnyReceipt): { valid: boolean; errors: string[]; normalized: AnyReceipt } {
  const migrated = migrateReceipt(receipt as Record<string, unknown>) as AnyReceipt;
  
  if (!migrated.receiptId) {
    migrated.receiptId = generateReceiptId();
  }
  if (!migrated.schemaVersion) {
    migrated.schemaVersion = RECEIPT_SCHEMA_VERSION;
  }
  if (!migrated.createdAt) {
    migrated.createdAt = new Date().toISOString();
  }
  if (!migrated.provenance) {
    migrated.provenance = {
      source: 'backend',
      signature: null,
      nonce: null,
      runnerId: null,
      environmentHash: null,
    };
  }
  
  const normalized = normalizeAbsentFields(migrated);
  const validation = validateReceiptSchema(normalized);
  return { valid: validation.valid, errors: validation.errors, normalized };
}

function normalizeAbsentFields(receipt: AnyReceipt): AnyReceipt {
  const absentToNull = (val: unknown): unknown => {
    if (val === '' || val === 'unknown' || val === undefined) return null;
    return val;
  };
  
  const normalized = { ...receipt };
  normalized.missionId = absentToNull(receipt.missionId) as string | null;
  normalized.runId = absentToNull(receipt.runId) as string | null;
  normalized.eventId = absentToNull(receipt.eventId) as string | null;
  normalized.actorId = absentToNull(receipt.actorId) as string | null;
  normalized.capabilityId = absentToNull(receipt.capabilityId) as string | null;
  normalized.inputHash = absentToNull(receipt.inputHash) as string | null;
  normalized.outputHash = absentToNull(receipt.outputHash) as string | null;
  normalized.failureReason = absentToNull(receipt.failureReason) as string | null;
  normalized.authorization = receipt.authorization || null;
  normalized.budgetCost = receipt.budgetCost || null;
  
  if (!normalized.status) {
    normalized.status = 'success' as ReceiptStatus;
  }
  
  return normalized;
}

/**
 * Compute deterministic payload hash for deduplication
 */
export function computePayloadHash(receipt: AnyReceipt): string {
  return canonicalJson(receipt as Record<string, unknown>);
}

export { RECEIPT_KINDS, RECEIPT_SCHEMA_VERSION, ReceiptStatus };
export type { AnyReceipt, ReceiptKind, ReceiptStatus, AuthorizationRef, BudgetCost, ProvenanceInfo };