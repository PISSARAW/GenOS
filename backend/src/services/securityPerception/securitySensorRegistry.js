'use strict';

const { requiredText, clamp } = require('./securityPerceptionPrimitives');

function register(state, input) {
  const sensorId = requiredText(input?.sensorId, 'ASP_SENSOR_ID_REQUIRED', 128);
  const permissions = new Set(Array.isArray(input.permissions) ? input.permissions : []);
  if (!permissions.has('security:observe')) throw new Error('ASP_SENSOR_PERMISSION_REQUIRED');
  const sensor = { sensorId, kind: requiredText(input.kind, 'ASP_SENSOR_KIND_REQUIRED', 64),
    quality: clamp(input.quality), permissions: [...permissions].filter((item) => item === 'security:observe').sort(),
    enabled: input.enabled !== false, registeredAt: input.registeredAt || new Date().toISOString() };
  state.sensors[sensorId] = sensor;
  return sensor;
}

function authorize(state, sensorId) {
  const sensor = state.sensors[sensorId];
  if (!sensor?.enabled || !sensor.permissions.includes('security:observe')) throw new Error('ASP_SENSOR_NOT_AUTHORIZED');
  return sensor;
}

module.exports = { register, authorize };
