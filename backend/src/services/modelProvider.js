const { setTimeout: delay } = require('timers/promises');

function tokenize(text = '') { return String(text).trim().split(/\s+/).filter(Boolean); }

async function generate({ model = 'fake://local', prompt = '', onToken = () => {}, timeoutMs = 30000 }) {
  const run = async () => {
    if (model === 'fake://local' || model === 'local://runtime') {
      const output = `Local model response: ${prompt.slice(0, 240)}`;
      for (const token of tokenize(output)) { await delay(2); await onToken(token); }
      return { text: output, inputTokens: tokenize(prompt).length, outputTokens: tokenize(output).length, provider: 'local' };
    }
    const provider = model.startsWith('anthropic://') ? 'anthropic' : model.startsWith('gemini://') ? 'gemini' : 'openai';
    const apiKey = provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : provider === 'gemini' ? process.env.GEMINI_API_KEY : (process.env.GENOS_MODEL_API_KEY || process.env.OPENAI_API_KEY);
    if (!apiKey) throw new Error(`No API key configured for model ${model}.`);
    const modelName = model.replace(/^(openai|anthropic|gemini):\/\//, '');
    const endpoint = provider === 'anthropic' ? (process.env.ANTHROPIC_API_ENDPOINT || 'https://api.anthropic.com/v1/messages') : provider === 'gemini' ? `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}` : (process.env.GENOS_MODEL_ENDPOINT || 'https://api.openai.com/v1/chat/completions');
    const headers = provider === 'anthropic' ? { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } : { 'Content-Type': 'application/json', ...(provider === 'gemini' ? {} : { Authorization: `Bearer ${apiKey}` }) };
    const body = provider === 'anthropic' ? { model: modelName, max_tokens: 2048, messages: [{ role: 'user', content: prompt }] } : provider === 'gemini' ? { contents: [{ parts: [{ text: prompt }] }] } : { model: modelName, messages: [{ role: 'user', content: prompt }], stream: false };
    const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Model provider returned HTTP ${response.status}.`);
    const payload = await response.json(); const text = provider === 'anthropic' ? (payload.content?.map((part) => part.text || '').join('') || '') : provider === 'gemini' ? (payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '') : (payload.choices?.[0]?.message?.content || '');
    for (const token of tokenize(text)) await onToken(token);
    return { text, inputTokens: payload.usage?.input_tokens || payload.usage?.prompt_tokens || tokenize(prompt).length, outputTokens: payload.usage?.output_tokens || payload.usage?.completion_tokens || tokenize(text).length, provider };
  };
  return Promise.race([run(), new Promise((_, reject) => setTimeout(() => reject(new Error(`Model timeout after ${timeoutMs}ms.`)), timeoutMs))]);
}

module.exports = { generate, tokenize };
