'use strict';
const fs = require('node:fs');
const path = require('node:path');
const outputRoot = process.argv[2];
if (!outputRoot || !path.isAbsolute(outputRoot)) {
  throw new Error('Usage: node benchmarks/attention-workers/score.cjs <absolute-output-root>');
}
const output = path.join(outputRoot, 'outputs');
const types = [
  'scout_cell', 'resident_daemon', 'bounded_worker', 'adaptive_worker', 'specialist',
  'procedural_executor', 'symbiotic_worker', 'verifier_worker', 'red_worker',
  'experimental_worker', 'formal_worker', 'synthesis_worker', 'creative_worker',
  'medical_worker', 'recovery_worker', 'forensic_worker', 'liaison_worker',
  'teaching_worker', 'sub_orchestrator'
];
const rows = Object.fromEntries(types.map(kind => [kind,
  JSON.parse(fs.readFileSync(path.join(output, `real-worker-${kind}.json`), 'utf8')).results[0]
]));
const content = kind => rows[kind].evidenceReport?.workerArtifact?.content || {};
const indices = kind => content(kind).result?.indices || content(kind).procedureReceipt?.result?.indices
  || content(kind).demonstration?.indices || [];
const checks = [
  ['19 types persistants', types.every(kind => rows[kind].created && rows[kind].agentId)],
  ['19 artefacts validés', types.every(kind => rows[kind].artifactValid)],
  ['19 décisions vérifiées', types.every(kind => rows[kind].run?.status === 'completed')],
  ['Child réel du sous orchestrateur', rows.sub_orchestrator.children?.length === 1
    && rows.sub_orchestrator.children[0].artifactValid === true
    && rows.sub_orchestrator.children[0].run?.status === 'completed'],
  ['Scout : seule la source cible est retenue', content('scout_cell').observations?.length === 1
    && content('scout_cell').observations[0].sourceRefs?.[0] === 'corpus://target'],
  ['Daemon : échantillon faible écarté', content('resident_daemon').anomalies?.length === 1
    && content('resident_daemon').anomalies[0].sourceRef === 'samples://native/1'],
  ['Bounded : 3 + 7', indices('bounded_worker').join(',') === '0,2'],
  ['Procedural : 3 + 7', indices('procedural_executor').join(',') === '0,2'],
  ['Symbiotic : 3 + 7', indices('symbiotic_worker').join(',') === '0,2'],
  ['Synthesis : désaccord Deploy seulement', content('synthesis_worker').disagreements?.length === 1
    && content('synthesis_worker').disagreements[0].claim === 'Deploy'],
  ['Forensic : météo écartée de la chaîne', content('forensic_worker').causalChain?.length === 1
    && content('forensic_worker').causalChain[0].from === 'deploy'
    && content('forensic_worker').causalChain[0].to === 'alert'],
  ['Teaching : 3 + 7 et transfert', indices('teaching_worker').join(',') === '0,2'
    && content('teaching_worker').transferCheck?.passed === true],
  ['Créatif : sélection pertinente', content('creative_worker').selectionRule === 'Goal-aligned evidence ranking'],
  ['Sous orchestrateur vérifié', rows.sub_orchestrator.run?.status === 'completed'
    && rows.sub_orchestrator.children?.[0]?.run?.status === 'completed']
];
const result = { source: 'real-worker-<type>.json', total: checks.length,
  passed: checks.filter(([, pass]) => pass).length,
  checks: checks.map(([name, pass]) => ({ name, pass: Boolean(pass) })) };
fs.writeFileSync(path.join(output, 'attention-assertions.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (result.passed !== result.total) process.exitCode = 1;
