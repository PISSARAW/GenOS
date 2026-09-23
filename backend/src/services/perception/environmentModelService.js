'use strict';

/**
 * EnvironmentModel : landmarks, traces, carte d'incertitude.
 */

function emptyModel() {
  return { landmarks: [], traces: [], uncertaintyMap: {} };
}

function addLandmark(opts) {
  const o = opts || {};
  const model = o.model || emptyModel();
  model.landmarks.push({ id: o.id, label: o.label, at: new Date().toISOString() });
  return model;
}

function addTrace(opts) {
  const o = opts || {};
  const model = o.model || emptyModel();
  model.traces.push({ id: o.id, kind: o.kind || 'scent', payload: o.payload || {}, at: new Date().toISOString() });
  if (model.traces.length > 100) model.traces.shift();
  return model;
}

function setUncertainty(opts) {
  const o = opts || {};
  const model = o.model || emptyModel();
  model.uncertaintyMap[o.region || 'global'] = Number(o.value) || 0;
  return model;
}

module.exports = { emptyModel, addLandmark, addTrace, setUncertainty };
