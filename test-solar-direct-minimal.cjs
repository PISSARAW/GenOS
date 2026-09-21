#!/usr/bin/env node
'use strict';
/**
 * Test minimal du runtime solar-direct.
 * Simule le bootstrap minimal (sans DB, sans capsules) pour valider
 * que le spawn du runtime solar-direct fonctionne et que Solar répond.
 */
'use strict';
console.log = (...args) => process.stderr.write('[TEST] ' + args.map(String).join(' ') + '\n');

const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

// Chemins
const nodeExe = process.env.GENOS_NODE_EXECUTABLE || process.execPath;
const runtimePath = path.resolve(__dirname, 'backend/bin/solar-direct-runtime-v2.cjs');
const wrapperPath = path.resolve(__dirname, 'backend/bin/runtime-wrapper.cjs');

console.log('=== TEST MINIMAL DU RUNTIME SOLAR-DIRECT ===');
console.log('nodeExe:', nodeExe);
console.log('nodeExe exists:', fs.existsSync(nodeExe));
console.log('runtimePath:', runtimePath);
console.log('runtimePath exists:', fs.existsSync(runtimePath));
console.log('wrapperPath:', wrapperPath);
console.log('wrapperPath exists:', fs.existsSync(wrapperPath));

// Vérifier le token OAuth
const authPath = path.join(process.env.LOCALAPPDATA || process.env.APPDATA, 'hermes', 'auth.json');
const authExists = fs.existsSync(authPath);
console.log('auth.json exists:', authExists);
if (authExists) {
  const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
  const nous = auth.providers.nous;
  const now = Math.floor(Date.now()/1000);
  const exp = new Date(nous.expires_at).getTime()/1000;
  console.log('Token expires:', nous.expires_at);
  console.log('Token delta (s):', exp - now);
  console.log('Token valid:', (exp - now > 0) ? 'YES' : 'EXPIRED');
} else {
  console.log('ERREUR: auth.json INTROUVABLE');
}

// Test 1: Essai direct d'appel Solar avec fetch
console.log('\n=== TEST 1: Appel direct à Solar (fetch) ===');
const { credentials } = require('./backend/bin/solarDirectContext.cjs');
if (!credentials?.accessToken) {
  console.log('ERREUR: Token OAuth pas disponible');
  process.exit(1);
}
console.log('Token disponible, length:', credentials.accessToken.length);

async function testDirectSolarCall() {
  const baseUrl = process.env.GENOS_SOLAR_API_URL || 'https://inference-api.nousresearch.com/v1';
  const model = process.env.GENOS_SOLAR_MODEL || 'solar-pro4:free';
  
  const body = JSON.stringify({
    model,
    messages: [{ role: 'user', content: 'Réponds en une phrase: quelle est la capitale de la France?' }],
    max_tokens: 32,
    temperature: 0.3,
    top_p: 0.95
  });
  
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  
  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${credentials.accessToken}`,
        'provider': 'nous'
      },
      body,
      signal: controller.signal
    });
    clearTimeout(timer);
    
    console.log('HTTP status:', resp.status);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.log('HTTP error response:', text.slice(0, 500));
      process.exit(1);
    }
    
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    console.log('Réponse Solar:', content?.slice(0, 200) || 'AUCUNE');
    
    if (!content) {
      console.log('ERREUR: Pas de contenu dans la réponse');
      process.exit(1);
    }
    
    console.log('\n✓ TEST 1 RÉUSSI: Solar répond');
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      console.log('ERREUR: Timeout Solar après 60s');
    } else {
      console.log('ERREUR réseau:', err.message);
    }
    process.exit(1);
  }
}

// Test 2: Test du spawn via le wrapper
console.log('\n=== TEST 2: Spawn du runtime via wrapper ===');

// Créer un payload protobuf minimal (similaire à ce que fait l'orchestrateur)
const { execSync } = require('child_process');
const protoDir = path.resolve(__dirname, 'backend/proto');

// Vérifier que les proto existent
console.log('proto/agent.proto exists:', fs.existsSync(path.join(protoDir, 'agent.proto')));
console.log('proto/telemetry.proto exists:', fs.existsSync(path.join(protoDir, 'telemetry.proto')));

// Générer le payload
const payloadScript = `
const path = require('path');
const root = require('protobufjs').Root;
const r = new root();

try {
  r.loadSync(path.join(process.argv[1], 'proto/agent.proto'));
  r.loadSync(path.join(process.argv[1], 'proto/telemetry.proto'));
} catch (e) {
  console.error('ERREUR CHARGEMENT PROTO:', e.message);
  process.exit(1);
}

const Mission = r.lookupType('genos.agent.v1.AgentMission');

const msg = Mission.create({
  agentId: 'test-minimal-' + Date.now(),
  prompt: 'Écris une devinette logique universitaire courte (max 500 mots).',
  name: 'Devinette Writer',
  role: 'writer',
  workspaceRoot: process.argv[1]
});

const buf = Buffer.from(Mission.encode(msg).finish());
const framed = Buffer.alloc(4 + buf.length);
framed.writeUInt32BE(buf.length, 0);
buf.copy(framed, 4);

process.stdout.write(framed);
`;

console.log('\nGénération du payload protobuf...');
let payloadBuf;
try {
  payloadBuf = execSync(
    `node -e "${payloadScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}" "${path.resolve(__dirname, 'backend')}"`,
    { encoding: 'buffer', timeout: 10000 }
  );
  console.log('Payload généré, taille:', payloadBuf.length, 'octets');
} catch (e) {
  console.log('ERREUR GÉNÉRATION PAYLOAD:', e.message);
  process.exit(1);
}

// Lancer le runtime via le wrapper
console.log('\nLancement du runtime via wrapper...');
console.log('wrapperPath:', wrapperPath);
console.log('runtimePath:', runtimePath);

const child = execFile(nodeExe, [wrapperPath, runtimePath], {
  cwd: path.resolve(__dirname, 'backend'),
  env: {
    ...process.env,
    GENOS_SOLAR_MODEL: 'solar-pro4:free',
    GENOS_SOLAR_API_URL: 'https://inference-api.nousresearch.com/v1',
    GENOS_SOLAR_SAMPLING_TIMEOUT_MS: '90000'
  }
});

let stdout = '';
let stderr = '';
const startTime = Date.now();

child.stdout.on('data', c => { stdout += c.toString(); });
child.stderr.on('data', c => { stderr += c.toString(); });

// Écrire le payload sur stdin
child.stdin.write(payloadBuf);
child.stdin.end();

// Timeout interne
const timeoutId = setTimeout(() => {
  console.log('\nTIMEOUT INTERNE (90s) - forçage kill');
  try { child.kill('SIGKILL'); } catch(e) {}
}, 90000);

child.on('close', code => {
  clearTimeout(timeoutId);
  const elapsed = Date.now() - startTime;
  console.log('\n=== RÉSULTAT TEST 2 ===');
  console.log('EXIT_CODE:', code);
  console.log('Temps écoulé:', elapsed, 'ms');
  console.log('STDOUT (first 2000 chars):', stdout.slice(0, 2000));
  console.log('STDERR (first 1500 chars):', stderr.slice(0, 1500));
  process.exit(0);
});

child.on('error', e => {
  clearTimeout(timeoutId);
  console.log('\nERREUR spawn/execFile:', e.code, e.errno, e.message);
  console.log('PATH:', e.path);
  process.exit(1);
});
