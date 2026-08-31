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

  let prompt = mission.prompt || mission.currentTask || "No prompt provided";

  // Clean the massive GenOS orchestration meta-prompt to avoid confusing small local models
  if (prompt.includes('MANDATORY FINAL SYNTHESIS PHASE') || prompt.includes('Assigned branch:')) {
    prompt = prompt.split('\n')[0].trim();
  }

  // Use a simple, natural language instruction instead of pseudo-roles (which conflict with API chat templates)
  const framedPrompt = `Please act as a helpful AI assistant and answer the following question accurately:\n\n${prompt}`;

  process.stdout.write(encodeEvent({
    eventType: 'AGENT_PLAN_CREATED',
    action: 'PLAN',
    detail: 'Local cognitive router runtime accepted the mission.',
    status: 'running',
    currentTask: prompt
  }));

  try {
    const reply = await modelRouter.generate(framedPrompt, { role: 'orchestrator' });
    
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
