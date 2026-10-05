/**
 * GenOS Common Receipt Schema
 * 
 * Shared between TypeScript (backend) and Rust (CLI/orchestrator).
 * Source of truth: this file. Rust mirrors via build script or manual sync.
 * 
 * Constraints:
 * - Durable write (append-only log + SQLite index)
 * - Idempotent (receiptId deduplication)
 * - Schema versioned (read old versions)
 * - Absent identity = null, absent state = "unknown"
 * - No invented identity or causality
 * - Produced at same transactional point as observed effect
 */

export const RECEIPT_SCHEMA_VERSION = '1.0.0';

export const RECEIPT_KINDS = Object.freeze({
  BIOLOGICAL_EXECUTION: 'genos.biological-execution-receipt/v1',
  CELL_DIVISION: 'genos.cell-division-receipt/v1',
  HOMEOSTASIS_TRANSITION: 'genos.homeostasis-transition-receipt/v1',
  CLINICAL_APPLICATION: 'genos.clinical-application/v1',
  REPRODUCTION: 'genos.reproduction-event/v1',
  QUORUM_RESPONSE: 'genos.neuro-glia-quorum-response/v1',
  CNIDOCYTE_ACTION: 'genos.cnidocyte-action/v1',
  STREAM_FILTERED: 'genos.choanocyte-stream-filtered/v1',
  POLYMORPHIC_RENDERED: 'genos.iridophore-rendered/v1',
  FLUX_THROTTLED: 'genos.guard-cell-flux-throttled/v1',
  PIPELINE_OSSIFIED: 'genos.tracheide-pipeline-ossified/v1',
  HGT_TRANSFER: 'genos.hgt-transfer/v1',
  MISSION_SUCCESSION: 'genos.mission-succession/v1',
  FOSSILIZATION: 'genos.fossilization/v1',
  CAUSAL_ANALYSIS: 'genos.causal-analysis/v1',
  AEIS_PROMOTION: 'genos.aeis-promotion/v1',
  // Generic capability receipt
  CAPABILITY_EXECUTION: 'genos.capability-execution/v1',
});

export type ReceiptKind = typeof RECEIPT_KINDS[keyof typeof RECEIPT_KINDS];

export interface ReceiptBase {
  // Core identity
  receiptId: string;                    // UUID v4, globally unique
  schemaVersion: string;                // RECEIPT_SCHEMA_VERSION
  kind: ReceiptKind;                    // Discriminant for payload shape
  
  // Context
  missionId: string | null;             // UUID, null for system-level receipts
  runId: string | null;                 // UUID, execution run identifier
  eventId: string | null;               // UUID, specific event triggering receipt
  
  // Actor & capability
  actorId: string | null;               // UUID, cell/agent/identity that performed action
  capabilityId: string | null;          // Stable capability identifier (e.g. 'cnidocyte.threat-screen')
  
  // Input/output integrity
  inputHash: string | null;             // SHA-256 of canonicalized input
  outputHash: string | null;            // SHA-256 of canonicalized output
  
  // Authorization & budget
  authorization: AuthorizationRef | null;  // Lease/token reference
  budgetCost: BudgetCost | null;           // Explicit resource cost
  
  // Status
  status: ReceiptStatus;                // 'success' | 'refused' | 'failed' | 'timeout'
  failureReason: string | null;         // Required when status !== 'success'
  
  // Provenance & audit
  provenance: ProvenanceInfo;           // Source, signature, nonce
  createdAt: string;                    // ISO 8601 UTC
}

export interface AuthorizationRef {
  type: 'lease' | 'token' | 'clinical' | 'mission' | 'none';
  identifier: string | null;            // Lease ID, token hash, authorization ID
  scope: string | null;                 // Capability scope granted
  expiresAt: string | null;             // ISO 8601 or null
}

export interface BudgetCost {
  amount: number;                       // Non-negative
  unit: string;                         // e.g. 'ATP', 'compute_ms', 'tokens', 'bytes'
  poolId: string | null;                // Budget pool identifier
}

export type ReceiptStatus = 'success' | 'refused' | 'failed' | 'timeout';

export interface ProvenanceInfo {
  source: 'rust-cli' | 'backend' | 'mcp' | 'orchestrator' | 'test';
  signature: string | null;             // HMAC or Ed25519 signature
  nonce: string | null;                 // Replay protection
  runnerId: string | null;              // Process/container identifier
  environmentHash: string | null;       // Env fingerprint for reproducibility
}

// Kind-specific payloads (extend ReceiptBase)
export interface BiologicalExecutionReceipt extends ReceiptBase {
  kind: typeof RECEIPT_KINDS.BIOLOGICAL_EXECUTION;
  tick: number | null;
  operation: string;
  consumed: boolean;
  completed: boolean;
  executionScope: 'organism' | 'cell';
  cellId: string | null;
  genomeId: string | null;
  homeostasisStateId: string | null;
  homeostasisStatus: string | null;
}

export interface CellDivisionReceipt extends ReceiptBase {
  kind: typeof RECEIPT_KINDS.CELL_DIVISION;
  parentCellId: string | null;
  daughterCellId: string | null;
  parentGenomeId: string | null;
  daughterGenomeId: string | null;
  lineageId: string | null;
  generation: number | null;
  completed: boolean;
  requestedCost: number;
  consumedCost: number;
  costUnit: string;
}

export interface HomeostasisTransitionReceipt extends ReceiptBase {
  kind: typeof RECEIPT_KINDS.HOMEOSTASIS_TRANSITION;
  fromStatus: string;
  toStatus: string;
  threshold: string;
  trigger: string;
  controllerDecision: 'allow' | 'deny' | 'throttle' | 'quarantine';
  revisionId: string | null;
}

export interface CapabilityExecutionReceipt extends ReceiptBase {
  kind: typeof RECEIPT_KINDS.CAPABILITY_EXECUTION;
  capability: string;                   // Same as capabilityId but required
  params: Record<string, unknown>;
  result: Record<string, unknown> | null;
  durationMs: number | null;
}

export type AnyReceipt =
  | BiologicalExecutionReceipt
  | CellDivisionReceipt
  | HomeostasisTransitionReceipt
  | CapabilityExecutionReceipt
  | ReceiptBase; // For extensibility

// Type guard
export function isReceipt(obj: unknown): obj is AnyReceipt {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as AnyReceipt).receiptId === 'string' &&
    typeof (obj as AnyReceipt).schemaVersion === 'string' &&
    typeof (obj as AnyReceipt).kind === 'string'
  );
}

// Canonical JSON for hashing (deterministic key order)
export function canonicalJson(value: Record<string, unknown>): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
  );
}

// Generate receiptId (UUID v4)
export function generateReceiptId(): string {
  // RFC 4122 v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Validate receipt structure
export function validateReceiptSchema(receipt: AnyReceipt): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!receipt.receiptId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receipt.receiptId)) {
    errors.push('receiptId must be UUID v4');
  }
  if (!receipt.schemaVersion) errors.push('schemaVersion required');
  if (!receipt.kind) errors.push('kind required');
  if (!RECEIPT_KINDS[keyof typeof RECEIPT_KINDS].includes(receipt.kind)) {
    errors.push(`unknown kind: ${receipt.kind}`);
  }
  if (receipt.status && !['success', 'refused', 'failed', 'timeout'].includes(receipt.status)) {
    errors.push(`invalid status: ${receipt.status}`);
  }
  if (receipt.status !== 'success' && !receipt.failureReason) {
    errors.push('failureReason required when status !== success');
  }
  if (receipt.createdAt && isNaN(Date.parse(receipt.createdAt))) {
    errors.push('createdAt must be valid ISO 8601');
  }
  return { valid: errors.length === 0, errors };
}

// Schema migration helper: read old versions
export function migrateReceipt(old: Record<string, unknown>): AnyReceipt {
  // v1.0.0 is current; add migrations here if schemaVersion changes
  const version = (old.schemaVersion as string) || '1.0.0';
  if (version === '1.0.0') return old as AnyReceipt;
  // Future: handle older versions
  return old as AnyReceipt;
}