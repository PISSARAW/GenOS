/**
 * @file quantumVfsService.js
 * @description Service singleton d'intégration du Quantum VFS dans l'écosystème GenOS.
 * Maintient et orchestre les espaces de cohérence quantique virtuels par workspace
 * et assure la passerelle avec le stockage physique et la télémétrie.
 */

const path = require('path');
const { normalizeRelativePath } = require('./pathSafety');
const {
  QuantumDecoherenceEngine,
  ObservableTrigger,
  EntanglementMode
} = require('./quantumVfs');
const telemetry = require('./telemetryObserver');

class QuantumVfsService {
  constructor() {
    this.enginesByWorkspace = new Map(); // workspaceId -> QuantumDecoherenceEngine
  }

  /**
   * Obtient ou instancie le moteur de cohérence quantique pour un workspace donné
   */
  getEngine(workspaceId = 'default_workspace', options = {}) {
    const wsId = String(workspaceId || 'default_workspace').trim();
    if (!this.enginesByWorkspace.has(wsId)) {
      const workspaceRoot = options.workspaceRoot || path.resolve(process.cwd());
      const engine = new QuantumDecoherenceEngine({
        workspaceRoot,
        ...options
      });
      this.enginesByWorkspace.set(wsId, engine);
    }
    return this.enginesByWorkspace.get(wsId);
  }

  /**
   * Enregistre un fichier en phase cohérente dans l'espace virtuel quantique
   */
  stageQuantumFile(workspaceId, filePath, content, options = {}) {
    const safePath = normalizeRelativePath(filePath, 'filePath');
    const engine = this.getEngine(workspaceId, options);
    const result = engine.stageQuantumFile(safePath, content, options);

    telemetry.emitEvent({
      eventType: 'QUANTUM_VFS_FILE_STAGED',
      action: 'STAGE_QUANTUM',
      detail: `Fichier ${safePath} mis en phase quantique dans le workspace ${workspaceId}`,
      severity: 'info',
      payload: { workspaceId, filePath: safePath, eigenstateCount: result.superposition.eigenstates.size }
    });

    return {
      success: true,
      workspaceId,
      filePath: safePath,
      eigenstatesCount: result.superposition.eigenstates.size,
      distribution: result.superposition.getStateDistribution()
    };
  }

  /**
   * Ajoute une hypothèse spéculative dans la superposition d'un fichier virtuel
   */
  superposeHypothesis(workspaceId, filePath, label, content, weight = 1.0, metadata = {}) {
    const safePath = normalizeRelativePath(filePath, 'filePath');
    const engine = this.getEngine(workspaceId);
    const superposition = engine.superpositions.get(safePath);

    if (!superposition) {
      throw new Error(`Fichier non trouvé en superposition quantique : ${safePath}`);
    }

    const state = superposition.addEigenstate(label, content, weight, metadata);
    return {
      success: true,
      workspaceId,
      filePath: safePath,
      addedState: { id: state.id, label: state.label, probability: state.probability },
      distribution: superposition.getStateDistribution()
    };
  }

  /**
   * Intrique deux fichiers virtuels sous un invariant synchrone non-local
   */
  entangleFiles(workspaceId, pathA, pathB, mode = EntanglementMode.INTERFACE_IMPLEMENTATION, rules = []) {
    const safePathA = normalizeRelativePath(pathA, 'pathA');
    const safePathB = normalizeRelativePath(pathB, 'pathB');
    const engine = this.getEngine(workspaceId);

    const pair = engine.entanglement.entangle(safePathA, safePathB, mode, rules);

    telemetry.emitEvent({
      eventType: 'QUANTUM_VFS_PAIR_ENTANGLED',
      action: 'ENTANGLE_PAIR',
      detail: `Paire intriquée créée entre ${safePathA} et ${safePathB}`,
      severity: 'info',
      payload: { workspaceId, pairId: pair.id, mode }
    });

    return {
      success: true,
      workspaceId,
      pairId: pair.id,
      pathA: safePathA,
      pathB: safePathB,
      mode: pair.mode,
      bellReport: engine.entanglement.verifyBellInequality()
    };
  }

  /**
   * Écrit dans un fichier verrouillé en exploitant l'effet tunnel quantique
   */
  tunnelWrite(workspaceId, filePath, content, agentEnergy = 1.0) {
    const safePath = normalizeRelativePath(filePath, 'filePath');
    const engine = this.getEngine(workspaceId);
    const tunnelResult = engine.tunneling.writeWithTunneling(safePath, content, agentEnergy);

    return {
      success: true,
      workspaceId,
      filePath: safePath,
      ...tunnelResult
    };
  }

  /**
   * Déclenche la décohérence macroscopique et la cristallisation sur le disque physique
   */
  async triggerDecoherence(workspaceId, trigger = ObservableTrigger.PERSISTENCE_FLUSH, options = {}) {
    const engine = this.getEngine(workspaceId, options);
    const report = await engine.triggerDecoherence(trigger, options);

    telemetry.emitEvent({
      eventType: 'QUANTUM_VFS_DECOHERENCE_TRIGGERED',
      action: 'DECOHERENCE_COLLAPSE',
      detail: `Décohérence déclenchée (${trigger}) pour le workspace ${workspaceId}`,
      severity: 'warning',
      payload: { workspaceId, trigger, crystallizedCount: report.crystallizedCount }
    });

    return {
      success: true,
      workspaceId,
      ...report
    };
  }

  /**
   * Récupère les métriques de cohérence quantique
   */
  getMetrics(workspaceId) {
    const engine = this.getEngine(workspaceId);
    return {
      workspaceId,
      metrics: engine.getCoherenceMetrics(),
      topology: engine.entanglement.getTopology()
    };
  }

  /**
   * Réinitialise l'espace quantique d'un workspace
   */
  reset(workspaceId) {
    if (workspaceId) {
      this.enginesByWorkspace.delete(workspaceId);
    } else {
      this.enginesByWorkspace.clear();
    }
    return { success: true, workspaceId: workspaceId || 'ALL' };
  }
}

const quantumVfsService = new QuantumVfsService();
module.exports = quantumVfsService;
