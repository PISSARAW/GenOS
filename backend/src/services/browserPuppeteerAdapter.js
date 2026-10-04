'use strict';

const path = require('path');
const fs = require('fs');
const dns = require('dns').promises;
const net = require('net');
const { abortable } = require('./operationDeadline');

class BrowserPuppeteerAdapter {
  constructor(options = {}) {
    this.puppeteer = options.puppeteer || require('puppeteer');
    this.artifactsDir = options.artifactsDir || path.resolve(process.cwd(), '.genos', 'workspace', 'screenshots');
    this.allowedHosts = new Set(options.allowedHosts || []);
  }

  async open(options = {}) {
    fs.mkdirSync(this.artifactsDir, { recursive: true });
    const configuredExecutable = process.env.GENOS_BROWSER_EXECUTABLE_PATH;
    const launchOptions = { ...options.launchOptions };
    if (configuredExecutable && !launchOptions.executablePath) launchOptions.executablePath = configuredExecutable;
    if (process.env.GENOS_BROWSER_NO_SANDBOX === '1') {
      const args = launchOptions.args || [];
      if (!args.includes('--no-sandbox')) launchOptions.args = [...args, '--no-sandbox'];
    }
    const browser = await this.puppeteer.launch({ headless: true, ...launchOptions });
    const page = await browser.newPage();
    await page.setViewport({ width: options.width || 1280, height: options.height || 900 });
    await page.setRequestInterception(true);
    page.on('request', request => this._continuePublicRequest(request));
    return { browser, page };
  }

  async navigate(page, url, options = {}) {
    options.signal?.throwIfAborted();
    return abortable(this._navigate(page, url, options), options.signal, () => page.close());
  }

  async _navigate(page, url, options = {}) {
    await this._assertPublicHttpUrl(url);
    options.signal?.throwIfAborted();
    const target = new URL(url);
    const response = await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs || 30000 });
    const screenshotPath = await this.capture(page);
    return {
      success: Boolean(response && response.ok()),
      statusCode: response ? response.status() : null,
      url: page.url(),
      title: await page.title(),
      html: await page.content(),
      screenshotPath
    };
  }

  async capture(page) {
    fs.mkdirSync(this.artifactsDir, { recursive: true });
    const screenshotPath = path.join(this.artifactsDir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return screenshotPath;
  }

  async _assertPublicHttpUrl(url) {
    const target = new URL(url);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
      throw new Error('Browser navigation requires credential-free HTTP(S).');
    }
    if (this.allowedHosts.has(target.hostname)) return;
    if (target.hostname === 'localhost' || target.hostname.endsWith('.localhost') || target.hostname.endsWith('.local')) {
      throw new Error('Browser navigation to local hostnames is blocked.');
    }
    const addresses = net.isIP(target.hostname)
      ? [{ address: target.hostname }]
      : await dns.lookup(target.hostname, { all: true });
    if (!addresses.length || addresses.some(item => this._isPrivateAddress(item.address))) {
      throw new Error('Browser navigation to local or private network addresses is blocked.');
    }
  }

  _isPrivateAddress(address) {
    if (address.includes(':')) {
      const normalized = address.toLowerCase();
      return normalized === '::1' || normalized === '::' || normalized.startsWith('fc')
        || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized)
        || normalized.startsWith('ff') || normalized.startsWith('::ffff:')
        || normalized.startsWith('2001:db8:');
    }
    const octets = address.split('.').map(Number);
    return octets[0] === 10 || octets[0] === 127 || octets[0] === 0
      || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168)
      || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
      || (octets[0] === 192 && octets[1] === 0 && octets[2] === 0)
      || (octets[0] === 192 && octets[1] === 0 && octets[2] === 2)
      || (octets[0] === 198 && octets[1] === 18)
      || (octets[0] === 198 && octets[1] === 19)
      || (octets[0] === 198 && octets[1] === 51 && octets[2] === 100)
      || (octets[0] === 203 && octets[1] === 0 && octets[2] === 113)
      || octets[0] >= 224;
  }

  async _continuePublicRequest(request) {
    try {
      await this._assertPublicHttpUrl(request.url());
      await request.continue();
    } catch (_) {
      await request.abort('blockedbyclient');
    }
  }

  async act(page, action) {
    const locator = action.selector
      ? page.locator(action.selector)
      : action.selectorId.startsWith('@')
      ? page.locator(this._selectorFromId(action.selectorId))
      : page.locator(action.selectorId);
    if (action.type === 'fill') await locator.fill(String(action.value ?? ''));
    else if (action.type === 'select_option') await locator.selectOption(String(action.value));
    else if (action.type === 'click' || action.type === 'submit') {
      if (action.navigationExpected) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }),
          locator.click()
        ]);
      } else {
        await locator.click();
      }
    }
    else throw new Error(`Unsupported browser action: ${action.type}`);
    return { success: true, url: page.url(), title: await page.title(), screenshotPath: await this.capture(page) };
  }

  _selectorFromId(selectorId) {
    const [kind, ...parts] = selectorId.split(':');
    const value = parts.join(':');
    const escaped = JSON.stringify(value);
    if (kind === '@input') return `input[id=${escaped}], input[name=${escaped}]`;
    if (kind === '@select') return `select[id=${escaped}], select[name=${escaped}]`;
    if (kind === '@button') return `button[id=${escaped}]`;
    if (kind === '@link') throw new Error('A link action must provide its observed href selector.');
    throw new Error(`Unsupported semantic selector: ${selectorId}`);
  }

  async close(session) {
    if (session && session.browser) await session.browser.close();
  }
}

module.exports = { BrowserPuppeteerAdapter };
