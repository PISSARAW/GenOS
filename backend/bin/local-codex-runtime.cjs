#!/usr/bin/env node
const { decodeMissionInput, encodeEvent } = require('../src/services/runtimeProtocol');
const modelRouter = require('../src/services/modelRouter');

let raw = Buffer.alloc(0);
process.stdin.on('data', (chunk) => { raw = Buffer.concat([raw, chunk]); });
process.stdin.on('end', async () => {
  let mission;
  try { 
      mission = decodeMissionInput(raw); 
  } catch (e) { 
      process.exit(2); 
  }

  const prompt = mission.prompt || mission.currentTask || "No prompt provided";

  process.stdout.write(encodeEvent({
    eventType: 'AGENT_PLAN_CREATED',
    action: 'PLAN',
    detail: 'Local cognitive router runtime accepted the mission.',
    status: 'running',
    currentTask: prompt
  }));

  try {
    const reply = await modelRouter.generate(prompt, { role: 'orchestrator' });
    
    const report = { 
        outcome: 'success', 
        claims: [{ statement: reply, evidence: [] }] 
    };
    
    process.stdout.write(encodeEvent({
      eventType: 'AGENT_COMPLETED',
      action: 'COMPLETE',
      detail: 'Local cognitive router completed.',
      status: 'completed',
      payload: { evidenceReport: report }
    }));
    process.exit(0);
  } catch(e) {
    process.stdout.write(encodeEvent({
      eventType: 'AGENT_FAILED',
      action: 'ERROR',
      detail: e.message,
      severity: 'error',
      status: 'error'
    }));
    process.exit(1);
  }
});
