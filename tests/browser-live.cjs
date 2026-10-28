/* Real ChatGPT, no intercepted responses or synthetic controls. Separate Edge profile. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const sockets = [];
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url); sockets.push(this.ws); this.n = 0; this.pending = new Map();
    this.ready = new Promise((resolve, reject) => { this.ws.addEventListener('open', resolve); this.ws.addEventListener('error', reject); });
    this.ws.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data); const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id); clearTimeout(pending.timeout);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error))); else pending.resolve(message.result);
    });
  }
  async send(method, params = {}) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = ++this.n;
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error('Timeout: ' + method)); }, 15000);
      this.pending.set(id, { resolve, reject, timeout }); this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
}
let browser, child, profile;
const report = { date: new Date().toISOString(), source: 'Real https://chatgpt.com/ in isolated Microsoft Edge, no interception', liveChatGPTVerified: false };
(async () => {
  const binary = process.env.BROWSER_BINARY;
  if (!binary || !fs.existsSync(binary) || !/msedge\.exe$/i.test(binary)) throw new Error('Set BROWSER_BINARY to installed msedge.exe');
  const artifacts = path.join(root, 'artifacts'); fs.mkdirSync(artifacts, { recursive: true });
  profile = fs.mkdtempSync(path.join(artifacts, 'live-edge-profile-'));
  child = spawn(binary, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, `--disable-extensions-except=${path.join(root, 'extension')}`,
    `--load-extension=${path.join(root, 'extension')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await wait(100);
  if (!fs.existsSync(portFile)) throw new Error('Owned Edge debugger did not start');
  const [port, wsPath] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
  browser = new CDP(`ws://127.0.0.1:${port}${wsPath}`);
  report.browser = await browser.send('Browser.getVersion');
  let worker;
  for (let i = 0; i < 60 && !worker; i++) {
    worker = (await browser.send('Target.getTargets')).targetInfos.find(t => t.type === 'service_worker' && t.url.endsWith('/background.js'));
    if (!worker) await wait(100);
  }
  report.extensionLoaded = !!worker;
  if (!worker) throw new Error('The test extension service worker did not start');
  const workerClient = new CDP(`ws://127.0.0.1:${port}/devtools/page/${worker.targetId}`);
  await workerClient.send('Runtime.enable');
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const page = new CDP(`ws://127.0.0.1:${port}/devtools/page/${targetId}`);
  await page.send('Page.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  report.navigation = await page.send('Page.navigate', { url: 'https://chatgpt.com/' });
  for (let i = 0; i < 60; i++) {
    await wait(500);
    const ready = await page.eval(`document.readyState === 'complete' && !!document.querySelector('#prompt-textarea, textarea, iframe[src*="challenges.cloudflare.com"]')`);
    if (ready) break;
  }
  report.interface = await page.eval(`({title:document.title, origin:location.origin, path:location.pathname,
    composer:!!document.querySelector('#prompt-textarea'),
    challenge:!!document.querySelector('iframe[src*="challenges.cloudflare.com"], #challenge-running, #challenge-stage') || /just a moment|verify you are human|проверка.*человек|один момент/i.test(document.title + ' ' + document.body.innerText),
    signIn:/log in|sign in|войти/i.test(document.body.innerText),
    controls:[...document.querySelectorAll('button[aria-label], button[data-testid]')].slice(-30).map(b=>({label:b.getAttribute('aria-label'),testid:b.getAttribute('data-testid')}))})`);
  report.extensionStatus = await workerClient.eval(`(async()=>{const tabs=await chrome.tabs.query({url:'https://chatgpt.com/*'});if(!tabs.length)return null;return chrome.tabs.sendMessage(tabs[0].id,{type:'activity-dot:status'}).catch(()=>null)})()`);
  const screenshot = await page.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifacts, 'live-chatgpt-access.png'), Buffer.from(screenshot.data, 'base64'));
  report.blocker = report.interface.challenge ? 'ChatGPT presents a human-verification challenge; not bypassed.'
    : !report.interface.composer ? 'The usable ChatGPT composer is unavailable in the clean test profile.'
    : 'Composer reachable. Live generation and browser-chrome screenshots still require the interactive owner check in docs/edge/live-check.md.';
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 2; // Access alone never certifies generation transitions.
})().catch(error => { report.error = error.message; process.exitCode = 1; console.error(error.stack); }).finally(async () => {
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'artifacts', 'browser-live-report.json'), JSON.stringify(report, null, 2) + '\n');
  if (browser) await browser.send('Browser.close').catch(() => {});
  for (const socket of sockets) socket.close();
  if (child && !child.killed) child.kill();
  if (profile) { await wait(400); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }
  setTimeout(() => process.exit(process.exitCode || 0), 100);
});
