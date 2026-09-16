const { getDatabase } = require('../src/db');
const { defineBeing, getBeing } = require('../src/services/ontologyService');
const crypto = require('crypto');

async function test() {
  const db = await getDatabase();
  
  const agent = await db.get('SELECT * FROM agents WHERE id = ?', 'test-substance-agent');
  console.log('agent:', JSON.stringify(agent, null, 2));
  
  const options = { purpose: 'test_execution' };
  const substanceData = {
    type: 'agent',
    essence: {
      role: agent.role,
      purpose: options.purpose || agent.current_task || 'task_execution',
      agentDna: agent.about || null,
      teleology: options.teleology || 'autonomous_execution',
      substanceCategory: 'primary',
      spinozaMode: 'finite_mode_of_extension_and_thought',
      leibnizMonad: true,
      cartesianPair: { cogitans: 'test-substance-agent', extensa: 'workspace-test-substance-agent' }
    },
    identityCriteria: {
      memoryContinuityRequired: true,
      workspaceContinuityRequired: true,
      essentialProperties: ['role', 'purpose', 'agentDna', 'spinozaMode'],
      maximalPartReplacementRatio: 0.3
    }
  };
  
  const being = await defineBeing('test-substance-agent', substanceData);
  console.log('being:', JSON.stringify(being, null, 2));
  
  function hashContent(content) {
    return crypto.createHash('sha256').update(JSON.stringify(content, Object.keys(content).sort())).digest('hex').slice(0, 16);
  }
  
  const essenceHash = hashContent({
    role: agent.role,
    purpose: options.purpose || agent.current_task || 'task_execution',
    agentDna: agent.about || null,
    substanceCategory: 'primary',
    spinozaMode: 'finite_mode_of_extension_and_thought'
  });
  console.log('essenceHash:', essenceHash);
  
  try {
    await db.run(
      'INSERT OR REPLACE INTO substance_records (id, category, agent_id, essence_hash, created_at) VALUES (?, "primary", ?, ?, CURRENT_TIMESTAMP)',
      'test-substance-agent', essenceHash
    );
    console.log('Insert succeeded');
  } catch (e) {
    console.log('Insert error:', e.message);
  }
}

test().catch(console.error);