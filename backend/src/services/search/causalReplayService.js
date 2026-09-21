/**
 * Causal Replay — Phase 9.
 *
 * Rejoue à partir du dernier point connu bon après une falsification.
 */

const { emit } = require('../agentOrchestrationState');
const { NaturalSearchActuator } = require('./naturalSearchActuatorService');

class CausalReplayService {
  constructor(options = {}) {
    this.actuator = options.actuator || new NaturalSearchActuator();
    this.replayHistory = new Map();
  }

  findCausalCommitment(history, hypothesisStatement) {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].statement && history[i].statement.includes(hypothesisStatement)) {
        return i;
      }
    }
    return -1;
  }

  createCheckpoints(events) {
    const checkpoints = [];
    let currentPhase = { start: 0, events: [] };

    for (let i = 0; i < events.length; i++) {
      currentPhase.events.push(events[i]);
      if (events[i].isCheckpoint || events[i].action === 'checkpoint') {
        checkpoints.push({ ...currentPhase });
        currentPhase = { start: i + 1, events: [] };
      }
    }
    checkpoints.push(currentPhase);
    return checkpoints;
  }

  async replay(agentId, failedHypothesis, events, ledger) {
    const checkpoints = this.createCheckpoints(events);
    const lastGoodCheckpoint = checkpoints.length > 1 ? checkpoints[checkpoints.length - 2] : checkpoints[0];

    const receipt = await this.actuator.execute('REPLAY_CAUSAL', {
      agentId,
      lockInHypothesis: { hypothesisId: failedHypothesis.id },
      lastKnownGood: `checkpoint_${lastGoodCheckpoint.start}`,
      topology: 'isolated',
      tools: ['grep', 'test']
    });

    emit(agentId, 'CAUSAL_REPLAY_INITIATED', 'REPLAY', `Replay from checkpoint ${lastGoodCheckpoint.start}`, {
      receiptId: receipt.id,
      failedHypothesis: failedHypothesis.statement,
      checkpointIndex: checkpoints.length - 2
    }, 'info');

    return { receipt, lastGoodCheckpoint };
  }
}

module.exports = { CausalReplayService }
