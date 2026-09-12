/**
 * @file waveParticleFile.js
 * @description Point 2 du Quantum VFS : La Dualité Onde-Corpuscule.
 * Transposition de la dualité onde-corpuscule (de Broglie / Fentes de Young) :
 * Chaque fichier possède simultanément une nature corpusculaire discrète
 * (code source, syntaxe, tokens, hash SHA-256) et une nature ondulatoire
 * continue (vecteur sémantique 768-D, phase, interférence constructive/destructive).
 */

const crypto = require('crypto');
const { textToVector } = require('../memoryScoring');

const PLANCK_CONSTANT = 1.0; // Constante normalisée

/**
 * Composante corpusculaire : discrète, vérifiable, mesurable sur disque
 */
class CorpuscularState {
  constructor(content, filePath = 'anonymous.js') {
    this.content = String(content || '');
    this.filePath = filePath;
    this.hash = crypto.createHash('sha256').update(this.content).digest('hex');
    this.sizeBytes = Buffer.byteLength(this.content, 'utf8');
    this.lineCount = this.content ? this.content.split('\n').length : 0;
  }
}

/**
 * Composante ondulatoire : continue, probabiliste, champ sémantique
 */
class WaveState {
  constructor(vector, phase = 0.0, wavelength = 1.0) {
    this.vector = Array.isArray(vector) ? vector : textToVector('');
    this.phase = Number.isFinite(phase) ? phase % (2 * Math.PI) : 0.0;
    this.wavelength = Math.max(0.01, Number(wavelength) || 1.0); // lambda = h / p
    this.frequency = PLANCK_CONSTANT / this.wavelength; // nu = E / h
  }

  /**
   * Calcule le produit scalaire (recouvrement de phase) avec une autre onde
   */
  dotProduct(otherWave) {
    if (!otherWave || !Array.isArray(otherWave.vector)) return 0.0;
    const len = Math.min(this.vector.length, otherWave.vector.length);
    let dot = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    for (let i = 0; i < len; i++) {
      const a = this.vector[i];
      const b = otherWave.vector[i];
      dot += a * b;
      normA += a * a;
      normB += b * b;
    }
    if (normA === 0 || normB === 0) return 0.0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

/**
 * Représentation duale d'un fichier dans le Quantum VFS
 */
class WaveParticleFile {
  constructor(content, filePath = 'anonymous.js', phase = 0.0) {
    this.corpuscle = new CorpuscularState(content, filePath);
    const vector = textToVector(content);
    const tokenCount = Math.max(1, this.corpuscle.content.split(/\s+/).length);
    const momentum = Math.max(0.1, Math.log2(tokenCount + 1));
    const wavelength = PLANCK_CONSTANT / momentum;
    this.wave = new WaveState(vector, phase, wavelength);
  }

  /**
   * Met à jour le contenu corpusculaire et recalcule l'onde associée
   */
  mutateContent(newContent) {
    this.corpuscle = new CorpuscularState(newContent, this.corpuscle.filePath);
    const vector = textToVector(newContent);
    const tokenCount = Math.max(1, this.corpuscle.content.split(/\s+/).length);
    const momentum = Math.max(0.1, Math.log2(tokenCount + 1));
    this.wave = new WaveState(vector, this.wave.phase, PLANCK_CONSTANT / momentum);
    return this;
  }

  /**
   * Projette le fichier sous forme de pur vecteur d'onde (dématérialisation)
   */
  toWaveform() {
    return {
      filePath: this.corpuscle.filePath,
      vector: this.wave.vector,
      phase: this.wave.phase,
      wavelength: this.wave.wavelength,
      frequency: this.wave.frequency
    };
  }

  /**
   * Matérialise l'état corpusculaire discret pour écriture disque ou validation
   */
  toCorpuscle() {
    return {
      filePath: this.corpuscle.filePath,
      content: this.corpuscle.content,
      hash: this.corpuscle.hash,
      sizeBytes: this.corpuscle.sizeBytes,
      lineCount: this.corpuscle.lineCount
    };
  }
}

/**
 * Analyse l'interférence sémantique entre deux fichiers ou ondes
 * I = |psi_A + psi_B|^2 = I_1 + I_2 + 2*sqrt(I_1*I_2)*cos(delta_phi)
 */
function calculateSemanticInterference(entityA, entityB) {
  const waveA = entityA instanceof WaveParticleFile ? entityA.wave : entityA;
  const waveB = entityB instanceof WaveParticleFile ? entityB.wave : entityB;

  if (!waveA || !waveB || typeof waveA.dotProduct !== 'function') {
    return { interferenceType: 'NEUTRAL', interferenceScore: 0.0, phaseShift: 0.0 };
  }

  const similarity = waveA.dotProduct(waveB);
  const deltaPhi = (waveA.phase - waveB.phase) % (2 * Math.PI);
  const phaseFactor = Math.cos(deltaPhi);
  const interferenceScore = similarity * phaseFactor;

  let interferenceType = 'NEUTRAL';
  if (interferenceScore >= 0.25) {
    interferenceType = 'CONSTRUCTIVE'; // Résonance positive : les intentions se renforcent
  } else if (interferenceScore <= -0.2) {
    interferenceType = 'DESTRUCTIVE'; // Dissonance / Conflit sémantique potentiel
  }

  return {
    interferenceType,
    interferenceScore: Number(interferenceScore.toFixed(4)),
    similarity: Number(similarity.toFixed(4)),
    phaseShift: Number(deltaPhi.toFixed(4)),
    isResonant: interferenceType === 'CONSTRUCTIVE'
  };
}

module.exports = {
  WaveParticleFile,
  CorpuscularState,
  WaveState,
  calculateSemanticInterference
};
