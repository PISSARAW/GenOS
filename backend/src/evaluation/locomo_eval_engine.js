/**
 * GenOS Native LoCoMo Evaluation Engine
 * Evaluates long-term conversational memory using GenOS Connectome (memory_synapses),
 * GraphRAG recursive CTE traversal, and Local Multi-LLM modelRouter.
 */

const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../db');
const { VectorMemoryService } = require('../services/vectorMemoryService');
const { generate } = require('../services/modelRouter');

const DATA_PATH = path.resolve(__dirname, '../../../../locomo/data/locomo10.json');

function normalizeAnswer(s) {
  if (!s) return '';
  const removePunct = (text) => text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');
  const whiteSpace = (text) => text.replace(/\s+/g, ' ').trim();
  const lower = (text) => text.toLowerCase();
  return whiteSpace(removePunct(lower(String(s))));
}

function computeF1(prediction, groundTruth) {
  const normPred = normalizeAnswer(prediction).split(' ').filter(Boolean);
  const normGold = normalizeAnswer(groundTruth).split(' ').filter(Boolean);
  if (!normPred.length || !normGold.length) return { f1: 0, em: 0 };
  
  const common = normPred.filter(token => normGold.includes(token));
  if (!common.length) return { f1: 0, em: 0 };

  const precision = common.length / normPred.length;
  const recall = common.length / normGold.length;
  const f1 = (2 * precision * recall) / (precision + recall);
  const em = normalizeAnswer(prediction) === normalizeAnswer(groundTruth) ? 1 : 0;
  return { f1, em };
}

const { textToVector } = require('../services/memoryScoring');

async function ingestConversationIntoConnectome(db, vectorMemory, sample) {
  const convId = sample.sample_id;
  const tenant = { organizationId: 'benchmark_locomo', projectId: convId };
  
  // Clean up any prior memories/synapses for this benchmark run
  await db.run('DELETE FROM memory_synapses WHERE organization_id = ? AND project_id = ?', tenant.organizationId, tenant.projectId);
  await db.run('DELETE FROM genome_decisions WHERE organization_id = ? AND project_id = ?', tenant.organizationId, tenant.projectId);

  const conv = sample.conversation || {};
  const sessionKeys = [];
  for (let i = 1; i <= 35; i++) {
    if (conv[`session_${i}`]) sessionKeys.push(i);
  }

  const sessionMemoryIds = [];

  for (const sessionIdx of sessionKeys) {
    const turns = conv[`session_${sessionIdx}`] || [];
    const dateTime = conv[`session_${sessionIdx}_date_time`] || `Session ${sessionIdx}`;
    
    // Format dialogue session text
    const dialogueText = turns.map(t => `${t.speaker}: ${t.text}`).join('\n');
    const content = `[Session ${sessionIdx} - Date: ${dateTime}]\n${dialogueText}`;
    const memId = `mem_locomo_${convId}_s${sessionIdx}`;
    const vec = textToVector(content);

    await vectorMemory.storeMemory(`speaker_${sample.speaker_a || 'user'}`, content, vec, {
      id: memId,
      title: `Conversation ${convId} - Session ${sessionIdx} (${dateTime})`,
      category: 'EpisodicMemory',
      synapticWeight: 2.0,
      organizationId: tenant.organizationId,
      projectId: tenant.projectId
    });

    sessionMemoryIds.push({ idx: sessionIdx, id: memId, dateTime });
  }

  // Wire Connectome Synapses between sequential sessions (Hebbian temporal chain)
  for (let i = 0; i < sessionMemoryIds.length - 1; i++) {
    const prev = sessionMemoryIds[i];
    const curr = sessionMemoryIds[i + 1];
    
    await db.run(`
      INSERT INTO memory_synapses (
        source_id, target_id, weight, transmitter_type,
        receptor_density, nmda_receptors, spine_morphology,
        organization_id, project_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, prev.id, curr.id, 2.0, 'glutamate', 1.8, 1.5, 'mushroom', tenant.organizationId, tenant.projectId);

    // Bidirectional retrograde synapse (supporting backward reasoning)
    await db.run(`
      INSERT INTO memory_synapses (
        source_id, target_id, weight, transmitter_type,
        receptor_density, nmda_receptors, spine_morphology,
        organization_id, project_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, curr.id, prev.id, 1.2, 'glutamate', 1.2, 1.0, 'thin', tenant.organizationId, tenant.projectId);
  }

  return sessionMemoryIds.length;
}

async function runLoCoMoEvaluation(options = {}) {
  const modelUri = options.model || 'ollama://qwen2.5-coder:7b';
  const maxSamples = options.maxSamples || null;
  const maxQuestions = options.maxQuestions || null;
  const targetConv = options.conv || null;
  const outFile = options.outFile || path.resolve(__dirname, 'locomo_real_genos_results.json');

  console.log('=== GenOS Native LoCoMo Blind Zero-Shot Evaluation ===');
  console.log(`Model: ${modelUri}`);
  console.log(`Dataset: ${DATA_PATH}`);
  console.log(`Output: ${outFile}\n`);

  if (!fs.existsSync(DATA_PATH)) {
    throw new Error(`LoCoMo dataset not found at ${DATA_PATH}`);
  }

  const rawData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const db = await getDatabase();
  const vectorMemory = new VectorMemoryService();

  let samples = rawData;
  if (targetConv) {
    samples = samples.filter(s => s.sample_id === targetConv);
  }
  if (maxSamples) {
    samples = samples.slice(0, maxSamples);
  }

  const results = {
    model: modelUri,
    started_at: new Date().toISOString(),
    conversations: {},
    category_scores: { 1: { f1: 0, em: 0, count: 0 }, 2: { f1: 0, em: 0, count: 0 }, 3: { f1: 0, em: 0, count: 0 }, 4: { f1: 0, em: 0, count: 0 }, 5: { f1: 0, em: 0, count: 0 } },
    overall: { total_q: 0, f1_sum: 0, em_sum: 0, mean_f1: 0, mean_em: 0 }
  };

  for (let sIdx = 0; sIdx < samples.length; sIdx++) {
    const sample = samples[sIdx];
    const convId = sample.sample_id;
    console.log(`\n[${sIdx + 1}/${samples.length}] Ingesting ${convId} into GenOS Connectome...`);

    const sessionsCount = await ingestConversationIntoConnectome(db, vectorMemory, sample);
    console.log(`  -> Ingested ${sessionsCount} sessions and wired synaptic connectome.`);

    let qas = sample.qa || [];
    if (maxQuestions) qas = qas.slice(0, maxQuestions);

    console.log(`  -> Evaluating ${qas.length} questions for ${convId}...`);
    results.conversations[convId] = [];

    for (let qIdx = 0; qIdx < qas.length; qIdx++) {
      const qa = qas[qIdx];
      const question = qa.question;
      const goldAnswer = qa.answer;
      const category = qa.category || 1;

      // 1. Query GenOS Cognitive Memory (GraphRAG + CTE traversal + Spreading Activation)
      const memoryResult = await vectorMemory.searchMemory(question, {
        vector: textToVector(question),
        limit: 5,
        hormone: 'dopamine',
        organizationId: 'benchmark_locomo',
        projectId: convId
      }, db);

      const recalledItems = (memoryResult.allScoredExperiences || []).slice(0, 4);
      const recalledContext = recalledItems.map(m => m.summary || m.content || '').join('\n\n');

      // 2. Build Zero-Shot Prompt with recalled episodic memory
      const prompt = `You are a precise factual assistant answering questions from conversational episodic memory.
Context from memory connectome:
${recalledContext}

Question: ${question}
Provide ONLY the direct factual answer (date, name, reason, or phrase). Do not write full sentences or repeat the question.
Answer:`;

      // 3. Query Model through GenOS Model Router
      let prediction = '';
      try {
        const genResult = await generate({
          prompt,
          model: modelUri,
          maxTokens: 32,
          timeoutMs: 45000,
          priority: 'interactive',
          db
        });
        prediction = (genResult.text || '').trim();
      } catch (err) {
        console.error(`    [Q${qIdx + 1}] Model Error: ${err.message}`);
      }

      const { f1, em } = computeF1(prediction, goldAnswer);

      results.overall.total_q++;
      results.overall.f1_sum += f1;
      results.overall.em_sum += em;

      if (!results.category_scores[category]) {
        results.category_scores[category] = { f1: 0, em: 0, count: 0 };
      }
      results.category_scores[category].count++;
      results.category_scores[category].f1 += f1;
      results.category_scores[category].em += em;

      results.conversations[convId].push({
        id: `q_${qIdx + 1}`,
        question,
        gold: goldAnswer,
        prediction,
        category,
        f1: Number(f1.toFixed(4)),
        em
      });

      console.log(`    [Q ${qIdx + 1}/${qas.length}] Cat ${category} | Q: ${question.slice(0, 45)}... -> "${prediction}" (Gold: "${goldAnswer}") [F1: ${(f1 * 100).toFixed(0)}%]`);
    }

    // Persist checkpoint after each conversation
    results.overall.mean_f1 = Number((results.overall.f1_sum / results.overall.total_q).toFixed(4));
    results.overall.mean_em = Number((results.overall.em_sum / results.overall.total_q).toFixed(4));
    fs.writeFileSync(outFile, JSON.stringify(results, null, 2), 'utf8');
    console.log(`\n>>> [CHECKPOINT ${sIdx + 1}/${samples.length}] ${convId} completed!`);
    console.log(`>>> Running Cumulative F1: ${(results.overall.mean_f1 * 100).toFixed(2)}% | Evaluated: ${results.overall.total_q}/1986`);
    console.log(`>>> Checkpoint written to: ${outFile}\n`);
  }

  console.log('\n=== LoCoMo Real Evaluation Complete ===');
  console.log(`Total Questions Evaluated: ${results.overall.total_q}`);
  console.log(`Mean F1 Score: ${(results.overall.mean_f1 * 100).toFixed(2)}%`);
  console.log(`Exact Match (EM): ${(results.overall.mean_em * 100).toFixed(2)}%`);
  console.log('Category breakdown:');
  for (const [cat, data] of Object.entries(results.category_scores)) {
    if (data.count > 0) {
      console.log(`  Cat ${cat}: ${(data.f1 / data.count * 100).toFixed(1)}% F1 (${data.count} questions)`);
    }
  }
  console.log(`Results saved to: ${outFile}`);
  return results;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = (flag, fallback = null) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
  };

  const options = {
    model: getArg('--model', 'ollama://qwen2.5-coder:7b'),
    maxSamples: getArg('--max-samples') ? parseInt(getArg('--max-samples'), 10) : null,
    maxQuestions: getArg('--max-questions') ? parseInt(getArg('--max-questions'), 10) : null,
    conv: getArg('--conv', null),
    outFile: getArg('--out-file', null)
  };

  runLoCoMoEvaluation(options).catch(err => {
    console.error('[FATAL]', err);
    process.exit(1);
  });
}

module.exports = { runLoCoMoEvaluation, ingestConversationIntoConnectome };
