const fs = require('fs');
const path = require('path');
const os = require('os');

const convDir = path.join(os.homedir(), '.genos', 'conversations');

if (!fs.existsSync(convDir)) {
  fs.mkdirSync(convDir, { recursive: true });
}

function listConversations() {
  const files = fs.readdirSync(convDir).filter(f => f.endsWith('.json'));
  const convs = files.map(file => {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(convDir, file), 'utf8'));
      return { id: content.id, title: content.title || 'Nouvelle Conversation', updatedAt: content.updatedAt };
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
  return convs.sort((a, b) => b.updatedAt - a.updatedAt);
}

function saveConversation(conv) {
  if (!conv || !conv.id) return;
  const file = path.join(convDir, "${conv.id}.json");
  conv.updatedAt = Date.now();
  fs.writeFileSync(file, JSON.stringify(conv, null, 2));
}

function loadConversation(id) {
  const file = path.join(convDir, "${id}.json");
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return null;
}

module.exports = { listConversations, saveConversation, loadConversation };
