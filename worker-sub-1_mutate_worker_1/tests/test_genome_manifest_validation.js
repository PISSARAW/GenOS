/**
 * test_genome_manifest_validation.js
 * 
 * End-to-end integration and integrity test suite for:
 * 1. specValidator (const, union types, bounds, additionalProperties)
 * 2. CLI agent create and agent validate (JSON & YAML) conforming to spec/genome.schema.json
 * 3. CLI snapshot create and snapshot validate conforming to spec/snapshot.schema.json
 * 4. CLI experiment incident & bug manifest validation
 * 5. Artifact Registry deterministic canonical hashing and manifest structural validation
 * 6. gRPC SchemaService restitution of real spec schema definitions
 */

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { validateWithSchema } = require('../src/services/specValidator');
const { canonicalJson, digest, validateManifest } = require('../src/controllers/registryController');
const schemaService = require('../src/grpc_services/schemaService');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const CLI_EXE = path.join(ROOT_DIR, 'target', 'debug', 'genos.exe');
const GENOME_SCHEMA_PATH = path.join(ROOT_DIR, 'spec', 'genome.schema.json');
const SNAPSHOT_SCHEMA_PATH = path.join(ROOT_DIR, 'spec', 'snapshot.schema.json');

function runCli(args) {
  const res = spawnSync(CLI_EXE, args, {
    cwd: ROOT_DIR,
    encoding: 'utf-8'
  });
  return {
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || ''
  };
}

async function runTests() {
  console.log('=== Lancement de la suite de tests de validation des génomes et manifestes ===\n');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-validation-test-'));

  try {
    // ------------------------------------------------------------------------
    // 1. specValidator : Validation unitaire des extensions du moteur de schéma
    // ------------------------------------------------------------------------
    console.log('[Test 1] specValidator : const, types unions, bornes et additionalProperties');

    const schemaTest = {
      type: 'object',
      required: ['apiVersion', 'kind', 'level', 'optional_desc'],
      properties: {
        apiVersion: { type: 'string' },
        kind: { type: 'string', const: 'AgentGenome' },
        level: { type: 'number', minimum: 1, maximum: 10 },
        optional_desc: { type: ['string', 'null'] }
      },
      additionalProperties: false
    };

    // Doit être valide avec chaîne ou null pour optional_desc
    const validDoc1 = {
      apiVersion: 'v0alpha1',
      kind: 'AgentGenome',
      level: 5,
      optional_desc: 'Description valide'
    };
    const res1 = validateWithSchema(validDoc1, schemaTest);
    assert.equal(res1.valid, true, 'Le document conforme doit être validé');

    const validDoc2 = {
      apiVersion: 'v0alpha1',
      kind: 'AgentGenome',
      level: 1,
      optional_desc: null
    };
    const res2 = validateWithSchema(validDoc2, schemaTest);
    assert.equal(res2.valid, true, 'Union type avec null doit être valide');

    // Doit rejeter un faux kind (const mismatch)
    const invalidKindDoc = {
      apiVersion: 'v0alpha1',
      kind: 'NotAnAgentGenome',
      level: 5,
      optional_desc: null
    };
    const resKind = validateWithSchema(invalidKindDoc, schemaTest);
    assert.equal(resKind.valid, false, 'Le faux kind doit être rejeté par la règle const');
    assert.ok(resKind.errors.some(e => e.includes('must equal')), 'Message derreur explicite pour const');

    // Doit rejeter une valeur hors bornes
    const outOfBoundsDoc = {
      apiVersion: 'v0alpha1',
      kind: 'AgentGenome',
      level: 0,
      optional_desc: null
    };
    const resBounds = validateWithSchema(outOfBoundsDoc, schemaTest);
    assert.equal(resBounds.valid, false, 'Valeur sous le minimum doit être rejetée');

    // Doit rejeter les propriétés inattendues quand additionalProperties est false
    const extraPropDoc = {
      apiVersion: 'v0alpha1',
      kind: 'AgentGenome',
      level: 5,
      optional_desc: null,
      forbiddenExtra: 'boom'
    };
    const resExtra = validateWithSchema(extraPropDoc, schemaTest);
    assert.equal(resExtra.valid, false, 'Propriété supplémentaire doit être rejetée');

    console.log('  -> specValidator valide avec succès.\n');

    // ------------------------------------------------------------------------
    // 2. CLI agent create & agent validate
    // ------------------------------------------------------------------------
    console.log('[Test 2] CLI genos agent create & validate (JSON & YAML)');
    assert.ok(fs.existsSync(CLI_EXE), `Binaire CLI introuvable à : ${CLI_EXE}`);

    const genomeJsonFile = path.join(tmpDir, 'kwame_genome.json');
    const genomeYamlFile = path.join(tmpDir, 'tariq_genome.yaml');

    // Création JSON
    const createJsonRes = runCli(['agent', 'create', '--name', 'Kwame', '--role', 'architect', '--out', genomeJsonFile]);
    assert.equal(createJsonRes.status, 0, `agent create JSON a échoué: ${createJsonRes.stderr}`);
    assert.ok(fs.existsSync(genomeJsonFile), 'Fichier kwame_genome.json créé');

    // Validation JSON via la CLI
    const valJsonRes = runCli(['agent', 'validate', '--file', genomeJsonFile]);
    assert.equal(valJsonRes.status, 0, `agent validate JSON a échoué: ${valJsonRes.stderr}`);
    assert.ok(valJsonRes.stdout.includes('"status": "VALID"'), 'Statut VALID attendu dans le JSON de sortie');

    // Validation formelle du JSON généré contre spec/genome.schema.json via specValidator
    const genomeSchemaContent = JSON.parse(fs.readFileSync(GENOME_SCHEMA_PATH, 'utf-8'));
    const generatedGenome = JSON.parse(fs.readFileSync(genomeJsonFile, 'utf-8'));
    const specGenRes = validateWithSchema(generatedGenome, genomeSchemaContent);
    assert.equal(specGenRes.valid, true, `Le génome généré doit être 100% conforme à spec/genome.schema.json: ${JSON.stringify(specGenRes.errors)}`);

    // Création YAML
    const createYamlRes = runCli(['agent', 'create', '--name', 'Tariq', '--role', 'explorer', '--out', genomeYamlFile]);
    assert.equal(createYamlRes.status, 0, `agent create YAML a échoué: ${createYamlRes.stderr}`);
    assert.ok(fs.existsSync(genomeYamlFile), 'Fichier tariq_genome.yaml créé');

    // Validation YAML via la CLI
    const valYamlRes = runCli(['agent', 'validate', '--file', genomeYamlFile]);
    assert.equal(valYamlRes.status, 0, `agent validate YAML a échoué: ${valYamlRes.stderr}`);
    assert.ok(valYamlRes.stdout.includes('"status": "VALID"'), 'Statut VALID attendu pour le YAML');

    // Rejet d un génome corrompu
    const corruptedGenomeFile = path.join(tmpDir, 'corrupted_genome.json');
    fs.writeFileSync(corruptedGenomeFile, JSON.stringify({ apiVersion: 'v0alpha1', kind: 'FakeGenome' }));
    const valCorruptedRes = runCli(['agent', 'validate', '--file', corruptedGenomeFile]);
    assert.notEqual(valCorruptedRes.status, 0, 'Un génome incomplet doit être rejeté par agent validate');

    console.log('  -> CLI agent create & validate valides avec succès.\n');

    // ------------------------------------------------------------------------
    // 3. CLI snapshot create & snapshot validate
    // ------------------------------------------------------------------------
    console.log('[Test 3] CLI genos snapshot create & validate');

    const snapFile = path.join(tmpDir, 'kwame_snapshot.json');
    const createSnapRes = runCli(['snapshot', 'create', '--agent', genomeJsonFile, '--out', snapFile]);
    assert.equal(createSnapRes.status, 0, `snapshot create a échoué: ${createSnapRes.stderr}`);
    assert.ok(fs.existsSync(snapFile), 'Fichier kwame_snapshot.json créé');

    // Validation du snapshot via la CLI
    const valSnapRes = runCli(['snapshot', 'validate', '--file', snapFile]);
    assert.equal(valSnapRes.status, 0, `snapshot validate a échoué: ${valSnapRes.stderr}`);
    assert.ok(valSnapRes.stdout.includes('"status": "VALID"'), 'Statut VALID attendu pour le snapshot');

    // Validation formelle contre spec/snapshot.schema.json via specValidator
    const snapshotSchemaContent = JSON.parse(fs.readFileSync(SNAPSHOT_SCHEMA_PATH, 'utf-8'));
    const generatedSnapshot = JSON.parse(fs.readFileSync(snapFile, 'utf-8'));
    const specSnapRes = validateWithSchema(generatedSnapshot, snapshotSchemaContent);
    assert.equal(specSnapRes.valid, true, `Le snapshot généré doit être conforme à spec/snapshot.schema.json: ${JSON.stringify(specSnapRes.errors)}`);

    // Rejet d un snapshot invalide (manque snapshot_id)
    const corruptedSnapFile = path.join(tmpDir, 'corrupted_snapshot.json');
    fs.writeFileSync(corruptedSnapFile, JSON.stringify({ world_id: 'w1', state: {} }));
    const valCorruptedSnapRes = runCli(['snapshot', 'validate', '--file', corruptedSnapFile]);
    assert.notEqual(valCorruptedSnapRes.status, 0, 'Un snapshot invalide doit être rejeté');

    console.log('  -> CLI snapshot create & validate valides avec succès.\n');

    // ------------------------------------------------------------------------
    // 4. CLI experiment incident & bug manifest validation
    // ------------------------------------------------------------------------
    console.log('[Test 4] CLI genos experiment incident & bug manifest checking');

    const validManifestFile = path.join(tmpDir, 'experiment_manifest.json');
    fs.writeFileSync(validManifestFile, JSON.stringify({ incident: 'mem_leak', severity: 'high', root_node: 'n1' }));

    const emptyManifestFile = path.join(tmpDir, 'empty_manifest.json');
    fs.writeFileSync(emptyManifestFile, JSON.stringify({}));

    // Succès avec fichier manifeste valide
    const incValidRes = runCli(['experiment', 'incident', validManifestFile]);
    assert.equal(incValidRes.status, 0, 'incident doit réussir avec un manifeste valide');
    assert.ok(incValidRes.stdout.includes('"valid":true'), 'Sortie JSON doit confirmer la validité');

    const bugValidRes = runCli(['experiment', 'bug-investigation', validManifestFile]);
    assert.equal(bugValidRes.status, 0, 'bug-investigation doit réussir avec un manifeste valide');
    assert.ok(bugValidRes.stdout.includes('"valid":true'), 'Sortie JSON doit confirmer la validité');

    // Échec avec fichier vide
    const incEmptyRes = runCli(['experiment', 'incident', emptyManifestFile]);
    assert.notEqual(incEmptyRes.status, 0, 'incident doit échouer avec un objet JSON vide');

    // Échec avec fichier introuvable
    const incMissingRes = runCli(['experiment', 'incident', path.join(tmpDir, 'missing.json')]);
    assert.notEqual(incMissingRes.status, 0, 'incident doit échouer avec un fichier inexistant');

    console.log('  -> CLI experiment manifest checking validé avec succès.\n');

    // ------------------------------------------------------------------------
    // 5. Registry d Artefacts : Déterminisme du SHA-256 et validation structurelle
    // ------------------------------------------------------------------------
    console.log('[Test 5] Registry : Déterminisme canonique et validation de structure');

    // Test de déterminisme indépendamment de l ordre des clés
    const m1 = {
      version: '1.0.0',
      name: 'agent-planner',
      config: { temperature: 0.7, timeout: 30 },
      tags: ['ai', 'agent']
    };
    const m2 = {
      tags: ['ai', 'agent'],
      config: { timeout: 30, temperature: 0.7 },
      name: 'agent-planner',
      version: '1.0.0'
    };

    const d1 = digest(m1);
    const d2 = digest(m2);
    assert.equal(d1, d2, 'Deux objets ayant les mêmes clés dans un ordre différent doivent avoir le même digest canonique');

    // Test de rejet des manifestes vides ou non conformes selon le kind
    assert.equal(validateManifest('model', {}).valid, false, 'Manifeste model vide doit être rejeté');
    assert.equal(validateManifest('prompt', {}).valid, false, 'Manifeste prompt vide doit être rejeté');
    assert.equal(validateManifest('tool', {}).valid, false, 'Manifeste tool vide doit être rejeté');
    assert.equal(validateManifest('workflow', {}).valid, false, 'Manifeste workflow vide doit être rejeté');

    // Test d acceptation des manifestes conformes
    assert.equal(validateManifest('model', { model_id: 'claude-3-5-sonnet' }).valid, true);
    assert.equal(validateManifest('prompt', { template: 'System prompt: {{role}}' }).valid, true);
    assert.equal(validateManifest('tool', { name: 'bash_exec', runtime: 'docker' }).valid, true);
    assert.equal(validateManifest('workflow', { steps: [{ name: 'plan' }, { name: 'execute' }] }).valid, true);

    console.log('  -> Registry hashing et validation de manifestes validés avec succès.\n');

    // ------------------------------------------------------------------------
    // 6. gRPC SchemaService : Restitution du schéma JSON réel
    // ------------------------------------------------------------------------
    console.log('[Test 6] gRPC SchemaService : Restitution du schéma JSON réel');

    await new Promise((resolve, reject) => {
      schemaService.GetSchemaSpec({ request: { schema_name: 'genome.schema.json' } }, (err, resp) => {
        if (err) return reject(err);
        try {
          assert.ok(resp.json_schema, 'json_schema doit être renseigné');
          const parsed = JSON.parse(resp.json_schema);
          assert.equal(parsed.title, 'AgentGenome');
          assert.ok(parsed.required.includes('apiVersion'));
          assert.ok(parsed.required.includes('kind'));
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });

    console.log('  -> gRPC SchemaService validé avec succès.\n');

    console.log('================================================================');
    console.log('TOUS LES TESTS D INTÉGRITÉ DES GÉNOMES ET MANIFESTES SONT PASSÉS');
    console.log('================================================================');
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runTests().catch(err => {
  console.error('\nERREUR DANS LA SUITE DE TESTS :', err);
  process.exit(1);
});
