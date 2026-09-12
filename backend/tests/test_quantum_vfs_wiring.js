/**
 * @file test_quantum_vfs_wiring.js
 * @description Test d'intégration et de branchement du Quantum VFS dans l'infrastructure GenOS :
 * Service Singleton, API REST Express Controller, et Registre de Primitives d'Agents.
 */

const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

const quantumVfsService = require('../src/services/quantumVfsService');
const quantumVfsController = require('../src/controllers/quantumVfsController');
const { HANDLERS } = require('../src/services/primitiveHandlers/handlersRegistry');

async function runWiringTests() {
  console.log('[TEST] === Vérification du Branchement Global du Quantum VFS ===');

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'quantum-vfs-wiring-'));
  const testWorkspace = 'ws_quantum_wiring_1';

  try {
    // ----------------------------------------------------
    // 1. Test du Service Singleton QuantumVfsService
    // ----------------------------------------------------
    console.log('\n--- 1. Test du Service Singleton (quantumVfsService) ---');
    const stageResult = quantumVfsService.stageQuantumFile(testWorkspace, 'src/logic.ts', 'export const x = 1;', {
      workspaceRoot: tmpRoot
    });
    assert.strictEqual(stageResult.success, true);
    assert.strictEqual(stageResult.filePath, 'src/logic.ts');
    assert.strictEqual(stageResult.eigenstatesCount, 1);
    console.log('[OK] Fichier virtuellement stagé dans le workspace.');

    // Superposition d'une hypothèse
    const supResult = quantumVfsService.superposeHypothesis(testWorkspace, 'src/logic.ts', 'opt_branch', 'export const x = 2;', 3.0);
    assert.strictEqual(supResult.success, true);
    assert.strictEqual(supResult.distribution.length, 2);
    console.log('[OK] Hypothèse spéculative superposée.');

    // Intrication
    quantumVfsService.stageQuantumFile(testWorkspace, 'src/logic.test.ts', 'test("x", () => {});', { workspaceRoot: tmpRoot });
    const entResult = quantumVfsService.entangleFiles(testWorkspace, 'src/logic.ts', 'src/logic.test.ts');
    assert.strictEqual(entResult.success, true);
    assert.ok(entResult.pairId);
    console.log('[OK] Intrication non-locale établie.');

    // Sécurité : rejet des traversées de chemin
    assert.throws(() => {
      quantumVfsService.stageQuantumFile(testWorkspace, '../secret.key', 'stolen');
    }, /contains an unsafe path segment|must stay relative/);
    console.log('[OK] Path traversal bloqué par le guard de sécurité.');

    // ----------------------------------------------------
    // 2. Test du Registre de Primitives d'Agents (HANDLERS)
    // ----------------------------------------------------
    console.log('\n--- 2. Test du Registre des Primitives (HANDLERS) ---');
    const primStage = await HANDLERS.quantum_vfs_stage({
      workspaceId: 'ws_primitive_test',
      filePath: 'contracts/token.sol',
      content: 'contract Token {}'
    });
    assert.strictEqual(primStage.success, true);
    console.log('[OK] Primitive quantum_vfs_stage exécutée.');

    const primSuperpose = await HANDLERS.quantum_vfs_superpose({
      workspaceId: 'ws_primitive_test',
      filePath: 'contracts/token.sol',
      label: 'erc20_upgrade',
      content: 'contract Token is ERC20 {}',
      weight: 4.0
    });
    assert.strictEqual(primSuperpose.success, true);
    console.log('[OK] Primitive quantum_vfs_superpose exécutée.');

    const primTunnel = await HANDLERS.quantum_vfs_tunnel_write({
      workspaceId: 'ws_primitive_test',
      filePath: 'contracts/token.sol',
      content: 'contract Token is ERC20, Ownable {}',
      energy: 5.0
    });
    assert.strictEqual(primTunnel.success, true);
    console.log('[OK] Primitive quantum_vfs_tunnel_write exécutée.');

    const primMetrics = await HANDLERS.quantum_vfs_metrics({ workspaceId: 'ws_primitive_test' });
    assert.strictEqual(primMetrics.success, true);
    assert.strictEqual(primMetrics.workspaceId, 'ws_primitive_test');
    console.log('[OK] Primitive quantum_vfs_metrics exécutée.');

    const primDecohere = await HANDLERS.quantum_vfs_decohere({
      workspaceId: 'ws_primitive_test',
      trigger: 'UNIT_TEST_EXECUTION',
      writeToDisk: false
    });
    assert.strictEqual(primDecohere.success, true);
    console.log('[OK] Primitive quantum_vfs_decohere exécutée avec effondrement.');

    // ----------------------------------------------------
    // 3. Test des Contrôleurs Express REST
    // ----------------------------------------------------
    console.log('\n--- 3. Test du Contrôleur Express REST (quantumVfsController) ---');
    function createMockRes() {
      return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(data) { this.body = data; return this; }
      };
    }

    const mockReq = {
      body: {
        workspaceId: 'ws_rest_test',
        filePath: 'api/service.ts',
        content: 'export class Service {}'
      }
    };
    const mockRes = createMockRes();
    await quantumVfsController.stageFile(mockReq, mockRes, (err) => { if (err) throw err; });
    assert.strictEqual(mockRes.statusCode, 200);
    assert.strictEqual(mockRes.body.success, true);
    console.log('[OK] Endpoint REST POST /api/quantum-vfs/stage validé.');

    const mockMetricsReq = { query: { workspaceId: 'ws_rest_test' } };
    const mockMetricsRes = createMockRes();
    await quantumVfsController.getMetrics(mockMetricsReq, mockMetricsRes, (err) => { if (err) throw err; });
    assert.strictEqual(mockMetricsRes.statusCode, 200);
    assert.strictEqual(mockMetricsRes.body.workspaceId, 'ws_rest_test');
    console.log('[OK] Endpoint REST GET /api/quantum-vfs/metrics validé.');

    console.log('\n[RÉSULTAT] => Branchement du Quantum VFS validé sur toute la chaîne GenOS !');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    quantumVfsService.reset();
  }
}

runWiringTests().catch((err) => {
  console.error('[TEST ERROR]', err);
  process.exit(1);
});
