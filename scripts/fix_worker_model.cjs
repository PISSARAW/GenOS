const fs = require('fs');
let s = fs.readFileSync('backend/src/services/workerEvidenceBarrierLocal.js', 'utf8');
const isCrlf = s.includes('\r\n');
const normalize = str => str.replace(/\r\n/g, '\n');
const target = `function resolveWorkerModel(mission) {
  if (require('./qualityElevation/qualityNativeGeneration').runtimeContract(mission) && mission.qualityRuntime?.generatorModel) return require('./qualityElevation/qualityRuntimeModelAdapter').modelUri(mission.qualityRuntime.generatorModel);
  if (mission.localModel) return mission.localModel;
  if (mission.model) return mission.model;
  return process.env.GENOS_LOCAL_MODEL || process.env.OLLAMA_MODEL || 'llama3.1:8b';
}`;
const replacement = `function resolveWorkerModel(mission) {
  if (require('./qualityElevation/qualityNativeGeneration').runtimeContract(mission) && mission.qualityRuntime?.generatorModel) return require('./qualityElevation/qualityRuntimeModelAdapter').modelUri(mission.qualityRuntime.generatorModel);
  const raw = mission.localModel || mission.model || process.env.GENOS_LOCAL_MODEL || process.env.OLLAMA_MODEL || 'llama3.1:8b';
  return String(raw).includes('://') ? raw : \`ollama://\${raw}\`;
}`;
const sNorm = normalize(s);
const tNorm = normalize(target);
const rNorm = normalize(replacement);
if (sNorm.includes(tNorm)) {
  let res = sNorm.replace(tNorm, rNorm);
  if (isCrlf) res = res.replace(/\n/g, '\r\n');
  fs.writeFileSync('backend/src/services/workerEvidenceBarrierLocal.js', res, 'utf8');
  console.log('Replaced successfully');
} else {
  console.log('Target still not found');
}
