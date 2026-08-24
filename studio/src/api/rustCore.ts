/**
 * Rust Core Bridge API
 *
 * Typed access to /api/rust/* — the window onto the real genos-cli.
 */
import { apiRequest } from './http';

export interface RustCoreStatus {
  binary: string;
  available: boolean;
  root: string;
  version?: string | null;
  hint?: string;
}

export interface RustBridgeResponse<T = any> {
  operation: string;
  exitCode: number;
  result: T;
  stderr?: string;
  specValidation?: {
    available: boolean;
    schema: string;
    title?: string | null;
    valid: boolean;
    errors: string[];
  };
}

export const rustCoreApi = {
  getStatus: () => apiRequest<RustCoreStatus>('/api/rust/status'),
  listSnapshots: () => apiRequest<{ root: string; snapshots: Array<{ reference: string; file: string; sizeBytes: number }> }>('/api/rust/snapshots'),
  createSnapshot: (name: string, role: string) =>
    apiRequest<RustBridgeResponse>('/api/rust/snapshots', { method: 'POST', body: { name, role } }),
  hallucination: (op: 'detect' | 'analyze' | 'extract', snapshot: string) =>
    apiRequest<RustBridgeResponse>(`/api/rust/hallucination/${op}`, { method: 'POST', body: { snapshot } }),
  simulate: (snapshot: string, model: string) =>
    apiRequest<RustBridgeResponse>('/api/rust/hallucination/simulate', { method: 'POST', body: { snapshot, model } }),
  replay: (snapshot: string) =>
    apiRequest<RustBridgeResponse>('/api/rust/replay', { method: 'POST', body: { snapshot } }),
  diff: (a: string, b: string) =>
    apiRequest<RustBridgeResponse>('/api/rust/diff', { method: 'POST', body: { a, b } })
};
