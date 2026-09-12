/**
 * Browser Scout Service — Navigation Web Interactive Sémantique & Ingestion d'Artefacts.
 * Permet d'interagir avec des formulaires complexes (USGS, GitHub, arXiv),
 * via un Arbre d'Accessibilité Sémantique (AXTree) compact et intercepte les fichiers (.pdf, .csv).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class BrowserScoutService {
  constructor(options = {}) {
    this.sessions = new Map();
    this.downloadDir = options.downloadDir || path.resolve(process.cwd(), '.genos', 'workspace', 'downloads');
    try {
      if (!fs.existsSync(this.downloadDir)) fs.mkdirSync(this.downloadDir, { recursive: true });
    } catch (_) {}
  }

  createSession(sessionId = null, initialConfig = {}) {
    const id = sessionId || `scout_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const session = {
      id,
      currentUrl: null,
      title: '',
      history: [],
      formState: {},
      axTree: [],
      lastDownloadedFile: null,
      config: {
        timeoutMs: initialConfig.timeoutMs || 30000,
        interceptDownloads: initialConfig.interceptDownloads !== false,
        ...initialConfig
      }
    };
    this.sessions.set(id, session);
    return session;
  }

  getSession(sessionId) {
    return sessionId ? this.sessions.get(sessionId) || null : null;
  }

  closeSession(sessionId) {
    return this.sessions.delete(sessionId);
  }

  _parseAttrs(attrString) {
    const attrs = {};
    const regex = /([a-zA-Z0-9_\-:]+)(?:=(?:"([^"]*)"|'([^']*)'|([^>\s]+)))?/g;
    let m;
    while ((m = regex.exec(attrString)) !== null) {
      attrs[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
    }
    return attrs;
  }

  _stripTags(html) {
    let text = String(html || '');
    let previous;
    do {
      previous = text;
      text = text.replace(/<[^>]*>/g, '');
    } while (text !== previous);
    return text.replace(/[<>]/g, '').trim();
  }

  _isDownloadable(url) {
    if (!url) return false;
    const clean = url.split('?')[0].toLowerCase();
    return ['.pdf', '.xlsx', '.xls', '.csv', '.zip', '.png', '.docx'].some(ext => clean.endsWith(ext));
  }

  buildAXTree(html, url = '') {
    const axNodes = [];
    let count = 1;
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : 'Document';

    // Inputs
    const inRegex = /<input\b([^>]*)>/gi;
    let m;
    while ((m = inRegex.exec(html)) !== null) {
      const a = this._parseAttrs(m[1]);
      const type = (a.type || 'text').toLowerCase();
      if (type === 'hidden') continue;
      const id = a.id || a.name || `in_${count++}`;
      axNodes.push({ selectorId: `@input:${id}`, role: 'textbox', type, name: a.name || id, label: a.placeholder || a.name || id, value: a.value || '' });
    }

    // Selects
    const selRegex = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
    while ((m = selRegex.exec(html)) !== null) {
      const a = this._parseAttrs(m[1]);
      const id = a.id || a.name || `sel_${count++}`;
      const options = [];
      const optRegex = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
      let optM;
      while ((optM = optRegex.exec(m[2])) !== null) {
        const optA = this._parseAttrs(optM[1]);
        const text = this._stripTags(optM[2]);
        options.push({ value: optA.value !== undefined ? optA.value : text, label: text, selected: 'selected' in optA });
      }
      axNodes.push({ selectorId: `@select:${id}`, role: 'combobox', name: a.name || id, options, currentValue: (options.find(o => o.selected) || options[0] || {}).value || '' });
    }

    // Buttons
    const btnRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
    while ((m = btnRegex.exec(html)) !== null) {
      const a = this._parseAttrs(m[1]);
      const text = this._stripTags(m[2]);
      axNodes.push({ selectorId: `@button:${a.id || `btn_${count++}`}`, role: 'button', type: a.type || 'button', label: text || a.id || 'button', action: 'submit' });
    }

    // Links
    const linkRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    while ((m = linkRegex.exec(html)) !== null) {
      const a = this._parseAttrs(m[1]);
      if (!a.href || a.href.startsWith('#')) continue;
      const text = this._stripTags(m[2]);
      axNodes.push({ selectorId: `@link:${count++}`, role: 'link', href: a.href, label: text || a.href, isDownload: this._isDownloadable(a.href) });
    }

    return { title, axNodes };
  }

  async navigate(sessionId, url, options = {}) {
    let session = this.getSession(sessionId) || this.createSession(sessionId);

    if (this._isDownloadable(url) && session.config.interceptDownloads) {
      const dl = await this.interceptDownload(session, url, options.contentBuffer);
      return { success: true, type: 'download_intercepted', url, download: dl };
    }

    let html = options.htmlContent;
    let statusCode = 200;

    if (!html && url.startsWith('file://')) {
      const fPath = url.replace(/^file:\/\//, '');
      if (fs.existsSync(fPath)) html = fs.readFileSync(fPath, 'utf8');
      else return { success: false, error: `File not found: ${fPath}` };
    } else if (!html && typeof fetch !== 'undefined' && (url.startsWith('http://') || url.startsWith('https://'))) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'GenOS-Scout/3.0' }, signal: AbortSignal.timeout(session.config.timeoutMs) });
        statusCode = res.status;
        const cType = res.headers.get('content-type') || '';
        if (this._isDownloadable(url) || (!cType.includes('html') && !cType.includes('text'))) {
          const dl = await this.interceptDownload(session, url, Buffer.from(await res.arrayBuffer()));
          return { success: true, type: 'download_intercepted', url, download: dl };
        }
        html = await res.text();
      } catch (err) {
        return { success: false, error: err.message };
      }
    } else if (!html) {
      html = `<html><head><title>Mock Page</title></head><body><h1>${url}</h1></body></html>`;
    }

    const { title, axNodes } = this.buildAXTree(html, url);
    session.currentUrl = url;
    session.title = title;
    session.axTree = axNodes;
    session.history.push({ url, title, timestamp: new Date().toISOString() });

    return {
      success: true,
      sessionId: session.id,
      url,
      statusCode,
      title,
      interactiveNodesCount: axNodes.length,
      axTreeSummary: axNodes.map(n => ({ selectorId: n.selectorId, role: n.role, label: n.label, currentValue: n.currentValue || n.value }))
    };
  }

  async act(sessionId, action) {
    const session = this.getSession(sessionId);
    if (!session) return { success: false, error: `Session not found: ${sessionId}` };
    const { type, selectorId, value } = action;

    if (type === 'fill') {
      const node = session.axTree.find(n => n.selectorId === selectorId);
      if (!node) return { success: false, error: `Selector not found: ${selectorId}` };
      node.value = String(value !== undefined ? value : '');
      session.formState[node.name || selectorId] = node.value;
      return { success: true, selectorId, updatedValue: node.value, role: node.role };
    }

    if (type === 'select_option') {
      const node = session.axTree.find(n => n.selectorId === selectorId);
      if (!node || node.role !== 'combobox') return { success: false, error: `Combobox not found: ${selectorId}` };
      const opt = node.options.find(o => o.value === value || o.label === value) || { value, label: value };
      node.currentValue = opt.value;
      session.formState[node.name || selectorId] = opt.value;
      return { success: true, selectorId, selectedOption: opt };
    }

    if (type === 'click') {
      const node = session.axTree.find(n => n.selectorId === selectorId);
      if (!node) return { success: false, error: `Target not found: ${selectorId}` };
      if (node.role === 'link') {
        if (node.isDownload) {
          const dl = await this.interceptDownload(session, node.href);
          return { success: true, action: 'download', download: dl };
        }
        return await this.navigate(sessionId, node.href);
      }
      return this.submitForm(sessionId, session.formState);
    }

    if (type === 'submit') return this.submitForm(sessionId, value || session.formState);
    return { success: false, error: `Unsupported action: ${type}` };
  }

  submitForm(sessionId, submittedValues = {}) {
    const session = this.getSession(sessionId);
    if (!session) return { success: false, error: `Session not found: ${sessionId}` };
    const query = new URLSearchParams(submittedValues).toString();
    const resultUrl = `${session.currentUrl || 'https://web.internal/search'}?${query}`;
    return { success: true, action: 'form_submitted', resultUrl, formData: submittedValues };
  }

  async interceptDownload(session, fileUrl, buffer = null) {
    const filename = path.basename(fileUrl.split('?')[0]) || `download_${Date.now()}.bin`;
    const targetPath = path.join(this.downloadDir, filename);
    const content = buffer || Buffer.from(`Payload for ${fileUrl}\nCaptured at ${new Date().toISOString()}`);
    fs.writeFileSync(targetPath, content);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const receipt = { filename, localPath: targetPath, url: fileUrl, bytes: content.length, sha256: hash };
    if (session) session.lastDownloadedFile = receipt;
    return receipt;
  }

  snapshotSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) return null;
    return {
      id: session.id,
      currentUrl: session.currentUrl,
      title: session.title,
      formState: { ...session.formState },
      lastDownloadedFile: session.lastDownloadedFile ? { ...session.lastDownloadedFile } : null,
      timestamp: new Date().toISOString()
    };
  }
}

const defaultBrowserScout = new BrowserScoutService();

module.exports = { BrowserScoutService, defaultBrowserScout };
