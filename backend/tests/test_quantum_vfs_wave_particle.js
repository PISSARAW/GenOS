const assert = require('node:assert/strict');
const {
  WaveParticleFile,
  calculateSemanticInterference
} = require('../src/services/quantumVfs/waveParticleFile');

async function testWaveParticleDuality() {
  console.log('--- 1. Testing Dual Nature (Corpuscle vs Waveform) ---');
  const code = `
    const express = require('express');
    const app = express();
    app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  `;

  const qFile = new WaveParticleFile(code, 'src/api/server.js', 0.0);

  // Vérification corpusculaire
  const corpuscle = qFile.toCorpuscle();
  assert.equal(corpuscle.filePath, 'src/api/server.js');
  assert.ok(corpuscle.hash.length === 64, 'Must compute SHA-256 hash');
  assert.ok(corpuscle.sizeBytes > 0, 'Must have physical byte size');

  // Vérification ondulatoire
  const wave = qFile.toWaveform();
  assert.equal(wave.vector.length, 768, 'Must project into 768-D latent semantic space');
  assert.equal(wave.phase, 0.0);
  assert.ok(wave.wavelength > 0, 'Must have de Broglie wavelength');

  console.log('  ✅ PASS: Dual nature verified: concrete corpuscle + continuous 768-D wave.');

  console.log('--- 2. Testing Constructive Semantic Interference ---');
  // Fichier cohérent avec la même sémantique API / serveur
  const alignedCode = `
    const express = require('express');
    const router = express.Router();
    router.get('/api/status', (req, res) => res.json({ status: 'running' }));
  `;
  const alignedFile = new WaveParticleFile(alignedCode, 'src/api/routes.js', 0.0);

  const constructiveInterference = calculateSemanticInterference(qFile, alignedFile);
  assert.equal(constructiveInterference.interferenceType, 'CONSTRUCTIVE');
  assert.ok(constructiveInterference.interferenceScore > 0.25);
  assert.equal(constructiveInterference.isResonant, true);

  console.log(`  ✅ PASS: Constructive interference detected (Score: ${constructiveInterference.interferenceScore}).`);

  console.log('--- 3. Testing Destructive Interference via Phase Opposition ---');
  // Même vecteur mais en opposition de phase (pi radians)
  const outOfPhaseFile = new WaveParticleFile(alignedCode, 'src/api/routes_opposed.js', Math.PI);
  const destructiveInterference = calculateSemanticInterference(qFile, outOfPhaseFile);

  assert.equal(destructiveInterference.interferenceType, 'DESTRUCTIVE');
  assert.ok(destructiveInterference.interferenceScore < -0.2);
  assert.equal(destructiveInterference.isResonant, false);

  console.log(`  ✅ PASS: Destructive interference detected (Score: ${destructiveInterference.interferenceScore}).`);
}

(async () => {
  try {
    await testWaveParticleDuality();
    console.log('\n=============================================');
    console.log('QUANTUM VFS #2 (WAVE-PARTICLE) TESTS PASSED');
    console.log('=============================================');
  } catch (err) {
    console.error('Test failure:', err);
    process.exit(1);
  }
})();
