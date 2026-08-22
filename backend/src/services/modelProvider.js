const { setTimeout: delay } = require('timers/promises');

function tokenize(text = '') { return String(text).trim().split(/\s+/).filter(Boolean); }

async function generate({ model = 'fake://local', prompt = '', onToken = () => {}, timeoutMs = 30000 }) {
  const run = async () => {
    if (model === 'fake://local' || model === 'local://runtime') {
      const output = `Local model response: ${prompt.slice(0, 240)}`;
      for (const token of tokenize(output)) { await delay(2); onToken(token); }
      return { text: output, inputTokens: tokenize(prompt).length, outputTokens: tokenize(output).length, provider: 'local' };
    }
    const apiKey = process.env.GENOS_MODEL_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error(`No API key configured for model ${model}.`);
    const response = await fetch(process.env.GENOS_MODEL_ENDPOINT || 'https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: model.replace(/^openai:\/\//, ''), messages: [{ role: 'user', content: prompt }], stream: false }) });
    if (!response.ok) throw new Error(`Model provider returned HTTP ${response.status}.`);
    const payload = await response.json(); const text = payload.choices?.[0]?.message?.content || '';
    for (const token of tokenize(text)) onToken(token);
    return { text, inputTokens: payload.usage?.prompt_tokens || tokenize(prompt).length, outputTokens: payload.usage?.completion_tokens || tokenize(text).length, provider: 'openai-compatible' };
  };
  return Promise.race([run(), new Promise((_, reject) => setTimeout(() => reject(new Error(`Model timeout after ${timeoutMs}ms.`)), timeoutMs))]);
}

module.exports = { generate, tokenize };
