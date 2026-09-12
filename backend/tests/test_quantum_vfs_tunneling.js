const assert = require('node:assert/strict');
const {
  TunnelingWriter
} = require('../src/services/quantumVfs/tunnelingWriter');

async function testQuantumTunnelingWriter() {
  console.log('--- 1. Testing Classical Direct Write When Free ---');
  const writer = new TunnelingWriter();
  const filePath = 'src/models/user.js';
  const initialContent = 'class User { constructor(name) { this.name = name; } }';

  const directWrite = writer.writeWithTunneling(filePath, initialContent, 1.0);
  assert.equal(directWrite.tunneled, false);
  assert.equal(directWrite.status, 'DIRECT_CLASSICAL_WRITE');
  assert.equal(writer.readEffective(filePath).content, initialContent);
  console.log('  ✅ PASS: Free write proceeded through classical direct channel.');

  console.log('--- 2. Testing Quantum Tunneling Write Across Active Lock Barrier ---');
  // Installation d'un verrou lourd (barrière de potentiel V_0 = 3.0, épaisseur a = 1.2)
  writer.setBarrier(filePath, 3.0, 1.2, 'DATABASE_TRANSACTION_ACTIVE');

  const patchContent = 'class User { constructor(name, email) { this.name = name; this.email = email; } }';
  // L'agent écrit avec une énergie E = 1.5 < V_0 = 3.0
  const tunneledWrite = writer.writeWithTunneling(filePath, patchContent, 1.5);

  assert.equal(tunneledWrite.tunneled, true);
  assert.equal(tunneledWrite.status, 'QUANTUM_TUNNELED_SHADOW_PROJECTED');
  assert.ok(tunneledWrite.transmissionProbability > 0, 'Tunneling transmission probability T must be > 0');
  assert.ok(tunneledWrite.transmissionProbability < 1.0, 'T must be < 1.0 under barrier');

  // La lecture effective donne accès immédiat à la version tunnelisée
  const effective = writer.readEffective(filePath);
  assert.equal(effective.isShadow, true);
  assert.equal(effective.content, patchContent);

  console.log(`  ✅ PASS: Lock barrier successfully tunneled (T = ${tunneledWrite.transmissionProbability}). No deadlock or exception thrown.`);

  console.log('--- 3. Testing Asymptotic Coalescence Upon Barrier Drop ---');
  const clearReport = writer.clearBarrier(filePath);
  assert.equal(clearReport.coalesced, true);
  assert.equal(clearReport.status, 'ASYMPTOTIC_COALESCENCE_COMPLETED');

  // Après déverrouillage, la couche ombre a été absorbée dans la copie canonique
  const finalEffective = writer.readEffective(filePath);
  assert.equal(finalEffective.isShadow, false);
  assert.equal(finalEffective.content, patchContent);

  console.log('  ✅ PASS: Shadow layer seamlessly coalesced into canonical file as barrier collapsed.');
}

(async () => {
  try {
    await testQuantumTunnelingWriter();
    console.log('\n=============================================');
    console.log('QUANTUM VFS #6 (TUNNELING) TESTS PASSED');
    console.log('=============================================');
  } catch (err) {
    console.error('Test failure:', err);
    process.exit(1);
  }
})();
