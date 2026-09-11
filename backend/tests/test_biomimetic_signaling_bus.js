const assert = require('assert');
const fs = require('fs');
const path = require('path');
const signalingBus = require('../src/services/biomimeticSignalingBus');
const organization = require('../src/services/dynamicOrganizationService');
const { getDatabase, closeDatabase } = require('../src/db');

function testSignalTypesAndValidation() {
  assert.equal(signalingBus.SIGNAL_TYPES.LIGAND, 'ligand');
  assert.equal(signalingBus.SIGNAL_TYPES.VOLTAGE, 'voltage');
  assert.equal(signalingBus.SIGNAL_TYPES.PHEROMONE, 'pheromone');
  assert.equal(signalingBus.SIGNAL_TYPES.PLASMID, 'plasmid');
  assert.equal(signalingBus.SIGNAL_TYPES.TENSOR, 'tensor');
  assert.equal(signalingBus.SIGNAL_TYPES.TEXT, 'text');

  assert(signalingBus.isSupportedSignalType('ligand'));
  assert(signalingBus.isSupportedSignalType('VOLTAGE'));
  assert(!signalingBus.isSupportedSignalType('unknown_signal'));
}

function testPackingAndUnpacking() {
  const ligandPayload = { ligand: 'CAMP', concentration: 15.5, receptorTarget: 'PROTEIN_KINASE' };
  const packed = signalingBus.packSignalPayload('ligand', ligandPayload);
  assert(Buffer.isBuffer(packed));
  assert(packed.length > 0);

  const unpacked = signalingBus.unpackSignalPayload(packed, 'ligand');
  assert.deepStrictEqual(unpacked, ligandPayload);

  const textPack = signalingBus.packSignalPayload('text', { text: 'hello' });
  assert.strictEqual(textPack, null);
}

function testLigandReceptorKinetics() {
  const receptor = { targetLigand: 'EPINEPHRINE', threshold: 10.0, cascadeSignal: 'GLYCOGEN_BREAKDOWN' };
  const subThreshold = signalingBus.evaluateLigandReactivity({ ligand: 'EPINEPHRINE', concentration: 8.5 }, receptor);
  assert.strictEqual(subThreshold.triggered, false);
  assert.strictEqual(subThreshold.cascadeSignal, null);

  const activated = signalingBus.evaluateLigandReactivity({ ligand: 'EPINEPHRINE', concentration: 12.0 }, receptor);
  assert.strictEqual(activated.triggered, true);
  assert.strictEqual(activated.cascadeSignal, 'GLYCOGEN_BREAKDOWN');

  const mismatched = signalingBus.evaluateLigandReactivity({ ligand: 'DOPAMINE', concentration: 50.0 }, receptor);
  assert.strictEqual(mismatched.triggered, false);
}

function testElectrocyteConsensusAndKuramoto() {
  const syncPhases = [0.1, 0.12, 0.08, 0.11];
  const orderHigh = signalingBus.evaluateKuramotoOrder(syncPhases);
  assert(orderHigh > 0.95);

  const dispersedPhases = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
  const orderLow = signalingBus.evaluateKuramotoOrder(dispersedPhases);
  assert(orderLow < 0.1);

  const discharges = [
    { voltageMv: 120, phaseAngle: 0.05 },
    { voltageMv: 110, phaseAngle: 0.06 },
    { voltageMv: 100, phaseAngle: 0.04 }
  ];
  const consensus = signalingBus.evaluateElectrocyteConsensus(discharges, { thresholdMv: 300 });
  assert.strictEqual(consensus.consensusReached, true);
  assert.strictEqual(consensus.totalVoltageMv, 330);
  assert(consensus.kuramotoOrder > 0.99);

  const desyncDischarges = [
    { voltageMv: 200, phaseAngle: 0 },
    { voltageMv: 200, phaseAngle: Math.PI }
  ];
  const desyncConsensus = signalingBus.evaluateElectrocyteConsensus(desyncDischarges, { thresholdMv: 300 });
  assert.strictEqual(desyncConsensus.consensusReached, false);
}

function testChemotacticPheromones() {
  const pheromones = [
    { locusHash: 'locus-A', intensity: 3.5, isRepellent: false },
    { locusHash: 'locus-A', intensity: 1.0, isRepellent: true },
    { locusHash: 'locus-B', intensity: 5.0, isRepellent: false }
  ];
  const gradientA = signalingBus.computeChemotacticGradient(pheromones, 'locus-A');
  assert.strictEqual(gradientA, 2.5);

  const gradientB = signalingBus.computeChemotacticGradient(pheromones, 'locus-B');
  assert.strictEqual(gradientB, 5.0);

  const gradientC = signalingBus.computeChemotacticGradient(pheromones, 'locus-unknown');
  assert.strictEqual(gradientC, 0.0);
}

async function testDynamicOrganizationIntegration(db) {
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode) VALUES ('org-signaling-root','Root','orchestrator','running','orchestrator')");
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode,parent_agent_id) VALUES ('worker-chem-1','Chem1','implementation','running','worker','org-signaling-root')");
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode,parent_agent_id) VALUES ('worker-chem-2','Chem2','reviewer','running','worker','org-signaling-root')");

  await organization.changeOrganization(db, {
    orchestratorId: 'org-signaling-root',
    organization: 'stigmergy',
    reason: 'test biomimetic signaling',
    changedBy: 'org-signaling-root'
  });

  // 1. Publish biomimetic signal with NO textual content
  const signalData = { ligand: 'QUORUM_AUTOINDUCER', concentration: 77.4, locus: 'sec_auth' };
  const pub = await organization.publish(db, {
    orchestratorId: 'org-signaling-root',
    senderAgentId: 'worker-chem-1',
    kind: 'evidence',
    signalType: 'ligand',
    signalData
  });

  assert.strictEqual(pub.signalType, 'ligand');

  // 2. Inbox retrieval
  const inboxResult = await organization.inbox(db, {
    orchestratorId: 'org-signaling-root',
    requesterAgentId: 'worker-chem-2'
  });

  assert.strictEqual(inboxResult.messages.length, 1);
  const msg = inboxResult.messages[0];
  assert.strictEqual(msg.signalType, 'ligand');
  assert.strictEqual(msg.hasBiomimeticSignal, true);
  assert.deepStrictEqual(msg.signal, signalData);
  assert.strictEqual(msg.content, '[BIO_SIGNAL:ligand]');

  // 3. Fallback: Publish legacy text message
  const legacyPub = await organization.publish(db, {
    orchestratorId: 'org-signaling-root',
    senderAgentId: 'worker-chem-1',
    kind: 'evidence',
    content: 'plain text legacy report'
  });
  assert.strictEqual(legacyPub.signalType, 'text');

  // 4. Verification of error when neither content nor signalData is provided
  await assert.rejects(
    async () => {
      await organization.publish(db, {
        orchestratorId: 'org-signaling-root',
        senderAgentId: 'worker-chem-1',
        kind: 'evidence'
      });
    },
    (err) => err.code === 'MESSAGE_REQUIRED'
  );
}

async function run() {
  testSignalTypesAndValidation();
  testPackingAndUnpacking();
  testLigandReceptorKinetics();
  testElectrocyteConsensusAndKuramoto();
  testChemotacticPheromones();

  const dbPath = path.resolve(__dirname, 'biomimetic-signaling-test.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = await getDatabase(dbPath);
  try {
    await testDynamicOrganizationIntegration(db);
    console.log('All Biomimetic Signaling Bus tests passed successfully.');
  } finally {
    await closeDatabase(dbPath);
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
