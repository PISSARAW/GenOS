'use strict';

const { decodeMissionInput } = require('../../src/services/runtimeProtocol');
const { samplingOptions } = require('../../src/services/workerGenomeExpression');
const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  const mission = decodeMissionInput(Buffer.concat(chunks));
  process.stdout.write(JSON.stringify({ genome: mission.genome, sampling: samplingOptions(mission) }));
});
