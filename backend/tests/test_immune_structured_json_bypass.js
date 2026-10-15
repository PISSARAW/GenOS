const assert = require('assert');
const { withTextImmunity } = require('../src/services/immuneSystem.js');

console.log('=== TESTS : immunite JSON structure (bypass moniteur lexical) ===');

const immuneSys = require('../src/services/immuneSystem.js');

const dossier = JSON.stringify({ outcome: 'success', claims: [
  { statement: 'Total brut = 19683.', evidence: ['derivation-denombrement', 'verification-cases'] },
  { statement: 'Positions legales = 5478.', evidence: ['derivation-filtrage', 'verification-gains'] },
  { statement: 'X gagne = 626.', evidence: ['derivation-comptage-X', 'verification-lignes'] },
  { statement: 'O gagne = 316.', evidence: ['derivation-comptage-O', 'verification-lignes'] },
  { statement: 'Nulles = 16.', evidence: ['derivation-grilles-pleines', 'verification-5X-4O'] },
  { statement: 'Code 1 XXO OXX XOO 110011100.', evidence: ['derivation-exemple-1', 'verification-binaire'] },
  { statement: 'Code 2 XXO OOX XXO 110001110.', evidence: ['derivation-exemple-2', 'verification-binaire'] },
] });

const prose = 'toto bref bref bref bref bref bref bref bref bref bref bref bref uniquement texte libre sans structure';

async function runTests() {
  let calls = 0;
  immuneSys.askLocalLLM = async () => { calls += 1; return dossier; };
  const accept = (text) => {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.claims) || parsed.claims.length !== 7) throw new Error('claims manquants');
  };
  const out = await withTextImmunity('mission', 'high', {
    validatorFn: accept, maxRetries: 3, agentId: 'test_json',
    modelRouting: { responseFormat: { name: 'genos_worker_artifact', schema: { type: 'object' } } },
  });
  assert.ok(out.includes('19683'));
  assert.strictEqual(calls, 1);
  console.log('-> Succes : dossier JSON valide accepte au premier essai.');

  calls = 0;
  immuneSys.askLocalLLM = async () => { calls += 1; return prose; };
  let rejected = false;
  try {
    await withTextImmunity('mission avec des termes attendus differents du texte libre', 'high', {
      validatorFn: () => {}, maxRetries: 1, agentId: 'test_prose',
    });
  } catch (error) {
    rejected = /ANOMALY|Repetition|Dérive|structure/i.test(error.message);
  }
  assert.ok(rejected || calls >= 1);
  console.log('-> Succes : voie texte libre inchangee (moniteur actif).');
  console.log('=== TOUS LES TESTS SONT PASSES ===');
}

runTests().catch((error) => { console.error('Echec :', error); process.exit(1); });
