'use strict';

const fs = require('node:fs');
const {state, reply} = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const forbidden = async () => {throw new Error('Canonical preparation must not invoke a generic provider pipeline or write premature success memory.');};
const services = {strategyExecutionAdapter: {executePipelineWithFeedback: forbidden},
  agentMemory: {compileExecutionMemory: forbidden}};
require('../../bin/local-codex-runtime.cjs').runPostPipeline(services, state, reply)
  .catch(error => {process.stderr.write(error.stack); process.exitCode = 1;});
