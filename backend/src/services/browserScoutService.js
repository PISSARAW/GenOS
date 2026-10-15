/**
 * Browser Scout Service — Navigation Web Interactive Sémantique & Ingestion d'Artefacts.
 * Permet d'interagir avec des formulaires complexes (USGS, GitHub, arXiv),
 * via un Arbre d'Accessibilité Sémantique (AXTree) compact et intercepte les fichiers (.pdf, .csv).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { BrowserPuppeteerAdapter } = require('./browserPuppeteerAdapter');
const MAX_HTML_LENGTH = 2 * 1024 * 1024;

function matches(html, expression, project) {
  const nodes = [];
  let match;
  while ((match = expression.exec(html)) !== null) nodes.push(project(match));
  return nodes;
}

function selectOptions(service, html) {
  return matches(html, /<option\b([^>]*)>([\s\S]*?)<\/option>/gi, (match) => {
    const attrs = service._parseAttrs(match[1]);
    const label = stripMarkup(match[2]).trim();
    return { value: attrs.value !== undefined ? attrs.value : label, label, selected: 'selected' in attrs };
  });
}

function stripMarkup(input) {
  const source = String(input || '').slice(0, MAX_HTML_LENGTH);
  let output = '';
  let hiddenTag = '';
  for (let index = 0; index < source.length;) {
    if (source[index] !== '<') {
      if (!hiddenTag) output += source[index];
      index += 1;
      continue;
    }
    const tag = readMarkupTag(source, index, hiddenTag);
    if (!tag.complete) break;
    hiddenTag = tag.hiddenTag;
    index = tag.nextIndex;
  }
  return output;
}

function readMarkupTag(source, index, hiddenTag) {
  const end = source.indexOf('>', index + 1);
  if (end < 0) return { nextIndex: source.length, hiddenTag, complete: false };
  const rawTag = source.slice(index + 1, end).trim();
  const closing = rawTag.startsWith('/');
  const tagName = rawTag.replace(/^\/?\s*/, '').slice(0, 10).toLowerCase();
  if (closing && tagName.startsWith(hiddenTag)) hiddenTag = '';
  else if (!closing && !hiddenTag) hiddenTag = hiddenContentTag(tagName);
  return { nextIndex: end + 1, hiddenTag, complete: true };
}

function hiddenContentTag(tagName) {
  if (tagName.startsWith('script')) return 'script';
  return tagName.startsWith('style') ? 'style' : '';
}

function escapeCssString(value) {
  return String(value).replace(/[\u0000-\u001f\u007f\\"]/g, character => `\\${character.codePointAt(0).toString(16)} `);
}

class BrowserScoutService {
  constructor(options = {}) {
    this.sessions = new Map();
    this.browserAdapter = options.browserAdapter || new BrowserPuppeteerAdapter({ artifactsDir: options.screenshotDir });
    this.downloadDir = options.downloadDir || path.resolve(process.cwd(), '.genos', 'workspace', 'downloads');
    try {
      if (!fs.existsSync(this.downloadDir)) fs.mkdirSync(this.downloadDir, { recursive: true });
    } catch (_) {}
  }

  createSession(sessionId = null, initialConfig = {}) {
    const id = sessionId || `scout_${crypto.randomUUID()}`;
    const session = {
      id,
      currentUrl: null,
      title: '',
      history: [],
      formState: {},
      axTree: [],
      lastDownloadedFile: null,
      browser: null,
      browserPage: null,
      screenshotPath: null,
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

  async openBrowserSession(sessionId, options = {}) {
    const session = this.createSession(sessionId, options);
    const browserState = await this.browserAdapter.open(options);
    session.browser = browserState.browser;
    session.browserPage = browserState.page;
    return { sessionId: session.id, mode: 'browser', opened: true };
  }

  async closeSession(sessionId) {
    const session = this.getSession(sessionId);
    if (session && session.browser) await this.browserAdapter.close({ browser: session.browser });
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

  _isDownloadable(url) {
    if (!url) return false;
    const clean = url.split('?')[0].toLowerCase();
    return ['.pdf', '.xlsx', '.xls', '.csv', '.zip', '.png', '.docx'].some(ext => clean.endsWith(ext));
  }

  buildAXTree(html, url = '') {
    const source = String(html || '').slice(0, MAX_HTML_LENGTH);
    const title = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || 'Document';
    const counter = { value: 1 };
    const axNodes = [...this._inputNodes(source, counter), ...this._selectNodes(source, counter),
      ...this._buttonNodes(source, counter), ...this._linkNodes(source, counter)];
    return { title, axNodes };
  }

  _inputNodes(html, counter) {
    return matches(html, /<input\b([^>]*)>/gi, (match) => {
      const attrs = this._parseAttrs(match[1]);
      const type = (attrs.type || 'text').toLowerCase();
      if (type === 'hidden') return null;
      const id = attrs.id || attrs.name || `in_${counter.value++}`;
      return { selectorId: `@input:${id}`, role: 'textbox', type, name: attrs.name || id,
        label: attrs.placeholder || attrs.name || id, value: attrs.value || '' };
    }).filter(Boolean);
  }

  _selectNodes(html, counter) {
    return matches(html, /<select\b([^>]*)>([\s\S]*?)<\/select>/gi, (match) => {
      const attrs = this._parseAttrs(match[1]);
      const id = attrs.id || attrs.name || `sel_${counter.value++}`;
      const options = selectOptions(this, match[2]);
      return { selectorId: `@select:${id}`, role: 'combobox', name: attrs.name || id,
        options, currentValue: (options.find(option => option.selected) || options[0] || {}).value || '' };
    });
  }

  _buttonNodes(html, counter) {
    return matches(html, /<button\b([^>]*)>([\s\S]*?)<\/button>/gi, (match) => {
      const attrs = this._parseAttrs(match[1]);
      const label = stripMarkup(match[2]).trim();
      const id = attrs.id || `btn_${counter.value++}`;
      return { selectorId: `@button:${id}`, role: 'button', type: attrs.type || 'button',
        label: label || attrs.id || 'button', action: 'submit' };
    });
  }

  _linkNodes(html, counter) {
    return matches(html, /<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (match) => {
      const attrs = this._parseAttrs(match[1]);
      if (!attrs.href || attrs.href.startsWith('#')) return null;
      const label = stripMarkup(match[2]).trim();
      return { selectorId: `@link:${counter.value++}`, role: 'link', href: attrs.href,
        label: label || attrs.href, isDownload: this._isDownloadable(attrs.href) };
    }).filter(Boolean);
  }

  _updateObservation(session, html) {
    const text = stripMarkup(html).replace(/&nbsp;|&amp;|&lt;|&gt;/g, ' ').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
    const previous = new Set(session.observationTokens || []);
    const unique = [...new Set(text)];
    const novel = unique.filter(token => !previous.has(token));
    session.infoGain = unique.length ? novel.length / unique.length : 0;
    if (session.browserPage) {
      session.patchInfoHistory ||= [];
      session.patchInfoHistory.push({ infoGain: session.infoGain, observedAt: new Date().toISOString() });
    }
    session.observationTokens = [...new Set([...previous, ...unique])];
    session.observationText = text.join(' ').slice(0, 12000);
  }

  async navigate(sessionId, url, options = {}) {
    let session = this.getSession(sessionId) || this.createSession(sessionId);

    if (session.browserPage) {
      try {
        const result = await this.browserAdapter.navigate(session.browserPage, url, { ...session.config, signal: options.signal });
        options.signal?.throwIfAborted();
        if (!result.success) return { ...result, sessionId: session.id };
        const parsed = this.buildAXTree(result.html, result.url);
        Object.assign(session, {
          currentUrl: result.url, title: result.title, axTree: parsed.axNodes,
          screenshotPath: result.screenshotPath
        });
        this._updateObservation(session, result.html);
        session.history.push({ url: result.url, title: result.title, timestamp: new Date().toISOString() });
        return {
          success: true, sessionId: session.id, url: result.url,
          statusCode: result.statusCode, title: result.title,
          screenshotPath: result.screenshotPath, interactiveNodesCount: parsed.axNodes.length
        };
      } catch (err) {
        return { success: false, sessionId: session.id, error: err.message };
      }
    }

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
        const res = await fetch(url, { headers: { 'User-Agent': 'GenOS-Scout/3.0' }, signal: navigationSignal(session.config.timeoutMs, options.signal) });
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

    options.signal?.throwIfAborted();
    const { title, axNodes } = this.buildAXTree(html, url);
    session.currentUrl = url;
    session.title = title;
    session.axTree = axNodes;
    this._updateObservation(session, html);
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

    if (session.browserPage) {
      const node = session.axTree.find(item => item.selectorId === selectorId);
      if (!node) return { success: false, verified: false, error: `Selector not found: ${selectorId}` };
      const selector = node.role === 'link'
        ? `a[href="${escapeCssString(node.href)}"]`
        : null;
      try {
        const result = await this.browserAdapter.act(session.browserPage, {
          type, selectorId, selector, value,
          navigationExpected: node.role === 'link' || node.action === 'submit'
        });
        const html = await session.browserPage.content();
        const parsed = this.buildAXTree(html, session.browserPage.url());
        Object.assign(session, {
          currentUrl: session.browserPage.url(), title: parsed.title,
          axTree: parsed.axNodes, screenshotPath: result.screenshotPath
        });
        this._updateObservation(session, html);
        return { ...result, verified: true, observation: this.snapshotSession(sessionId) };
      } catch (err) {
        return { success: false, verified: false, error: err.message };
      }
    }

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
      screenshotPath: session.screenshotPath,
      infoGain: session.infoGain ?? null,
      observationText: session.observationText || '',
      formState: { ...session.formState },
      lastDownloadedFile: session.lastDownloadedFile ? { ...session.lastDownloadedFile } : null,
      timestamp: new Date().toISOString()
    };
  }
}

const defaultBrowserScout = new BrowserScoutService();

module.exports = { BrowserScoutService, defaultBrowserScout };

function navigationSignal(timeoutMs, signal) {
  const local = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([local, signal]) : local;
}
