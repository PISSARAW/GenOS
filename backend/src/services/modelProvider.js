function tokenize(text = '') { return String(text).trim().split(/\s+/).filter(Boolean); }

function configuredModel(model) {
  const value = String(model || process.env.GENOS_DEFAULT_MODEL || '').trim();
  if (!value) throw new Error('No model provider is configured. Set GENOS_DEFAULT_MODEL or provide an openai://, anthropic://, or gemini:// model URI.');
  if (!/^(openai|anthropic|gemini):\/\//.test(value)) throw new Error(`Unsupported model URI '${value}'. Use openai://, anthropic://, or gemini://.`);
  return value;
}

async function generate({ model, prompt = '', onToken = () => {}, timeoutMs = 30000 }) {
  const run = async () => {
    const resolvedModel = configuredModel(model);
    const provider = resolvedModel.startsWith('anthropic://') ? 'anthropic' : resolvedModel.startsWith('gemini://') ? 'gemini' : 'openai';
    const apiKey = provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : provider === 'gemini' ? process.env.GEMINI_API_KEY : (process.env.GENOS_MODEL_API_KEY || process.env.OPENAI_API_KEY);
    if (!apiKey) throw new Error(`No API key configured for model ${resolvedModel}.`);
    const modelName = resolvedModel.replace(/^(openai|anthropic|gemini):\/\//, '');
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

module.exports = { generate, tokenize, configuredModel };
