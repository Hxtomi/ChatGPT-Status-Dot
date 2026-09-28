/* Real Chromium browser + unpacked extension; synthetic pages, no account required. */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const project = path.resolve(__dirname, '..');
const extensionSource = path.join(project, 'extension');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const cases = [];
const external = [];
const sockets = [];
const reportPath = path.join(project, 'artifacts', 'browser-update-report.json');

class CDP {
  constructor(url) {
    this.socket = new WebSocket(url); this.sequence = 0; this.pending = new Map(); this.events = new Map();
    sockets.push(this.socket);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', event => {
      const data = JSON.parse(event.data);
      if (data.id) {
        const pending = this.pending.get(data.id); if (!pending) return;
        this.pending.delete(data.id); clearTimeout(pending.timeout);
        if (data.error) pending.reject(new Error(JSON.stringify(data.error))); else pending.resolve(data.result);
      } else this.events.get(data.method)?.(data.params);
    });
  }
  async send(method, params = {}) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ' ' + result.exceptionDetails.exception?.description);
    return result.result.value;
  }
}
const baseSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="16" fill="#40434d"/><path d="M41 20a17 17 0 1 0 0 24" fill="none" stroke="#fff" stroke-width="7"/></svg>';
const baseIcon = 'data:image/svg+xml;base64,' + Buffer.from(baseSvg).toString('base64');
const fixture = `<!doctype html><html><head><title>Activity Dot test</title><link id="native" rel="icon" type="image/svg+xml" sizes="any" href="${baseIcon}"></head><body><main><h1>Activity Dot test</h1><div id="messages"></div><form id="composer"><textarea id="prompt-textarea"></textarea><button type="button" aria-label="Send prompt">Send</button></form></main></body></html>`;
const overlay = 'document.querySelectorAll("#chatgpt-activity-dot-favicon").length';

async function until(client, expression, timeout = 5000) {
  const started = Date.now();
  while (!(await client.eval(expression))) {
    if (Date.now() - started > timeout) throw new Error('Condition not reached: ' + expression.slice(0,180));
    await wait(80);
  }
}
async function test(name, action) {
  const started = Date.now();
  try { await action(); cases.push({ name, passed: true, ms: Date.now() - started }); console.log('PASS ' + name); }
  catch (error) { cases.push({ name, passed: false, error: error.message }); throw error; }
}
let browser;
let child;
let profile;
let browserVersion;

(async () => {
  const candidates = [process.env.BROWSER_BINARY, process.env.EDGE_BINARY, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  const binary = candidates.find(candidate => fs.existsSync(candidate));
  assert.ok(binary, 'Set BROWSER_BINARY to an extension-capable Chromium or Edge executable');
  const artifacts = path.join(project, 'artifacts');
  fs.mkdirSync(artifacts, { recursive: true });
  profile = fs.mkdtempSync(path.join(artifacts, 'qa-profile-'));
  const extension = path.join(profile, 'extension');
  fs.cpSync(extensionSource, extension, { recursive: true });
  const scriptPath = path.join(extension, 'content.js');
  const source = fs.readFileSync(scriptPath, 'utf8');
  fs.writeFileSync(scriptPath, 'globalThis.__activityDotTestRevision = \"registered\";\n' + source);
  child = spawn(binary, [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });
  child.on('error', error => console.error(error.message));
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await wait(100);
  assert.ok(fs.existsSync(portFile), 'Owned test browser exposes its debugger');
  const [port, wsPath] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
  browser = new CDP(`ws://127.0.0.1:${port}${wsPath}`);
  browserVersion = await browser.send('Browser.getVersion');
  async function page(name) {
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const client = new CDP(targets.find(target => target.id === targetId).webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    client.events.set('Fetch.requestPaused', params => {
      const url = params.request.url;
      const isFixture = url === `https://chatgpt.com/c/${name}`;
      if (!isFixture) external.push(url.split('?')[0]);
      void client.send('Fetch.fulfillRequest', {
        requestId: params.requestId,
        responseCode: isFixture ? 200 : 404,
        responseHeaders: [{ name: 'Content-Type', value: isFixture ? 'text/html; charset=utf-8' : 'text/plain' }],
        body: Buffer.from(isFixture ? fixture : 'Blocked by test harness').toString('base64')
      });
    });
    await client.send('Fetch.enable', { patterns: [{ urlPattern: 'http*', requestStage: 'Request' }] });
    await client.send('Page.navigate', { url: `https://chatgpt.com/c/${name}` });
    await until(client, 'document.readyState === "complete"');
    return client;
  }
  const first = await page('activity-dot-chat-fixture');
  await first.send('Page.bringToFront');
  await until(first, 'document.hasFocus() && document.visibilityState === "visible"');
  await wait(600);
  const targets = (await browser.send('Target.getTargets')).targetInfos;
  const worker = targets.find(target => target.type === 'service_worker' && target.url.endsWith('/background.js'));
  assert.ok(worker, 'Unpacked extension actually loaded (service worker present)');
  let workerClient = new CDP(`ws://127.0.0.1:${port}/devtools/page/${worker.targetId}`);
  const stop = 'document.getElementById("composer").insertAdjacentHTML("beforeend",\'<button id="stop" type="button" data-testid="stop-button" aria-label="Stop streaming">Stop</button>\')';

  async function state(name) {
    return workerClient.eval(`(async()=>{const [tab]=await chrome.tabs.query({url:'https://chatgpt.com/c/${name}'}); const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>({revision:globalThis.__activityDotTestRevision,state:globalThis.__chatgptActivityDotV1?.status()})});return result})()`);
  }
  async function dotColor(client) {
    return client.eval(`(async()=>{const link=document.getElementById('chatgpt-activity-dot-favicon');if(!link)return null;const i=new Image();i.src=link.href;await i.decode();const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.drawImage(i,0,0);return [...x.getImageData(50,50,1,1).data]})()`);
  }
  await test('Disk edits and hot injection leave new tabs on the registered script', async () => {
    await first.eval(stop); await until(first, `${overlay} === 1`);
    fs.writeFileSync(scriptPath, 'globalThis.__activityDotTestRevision = "updated";\n' + source);
    const manifestPath = path.join(extension, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.version = '1.0.99';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    await workerClient.eval(`(async()=>{const [tab]=await chrome.tabs.query({url:'https://chatgpt.com/c/activity-dot-chat-fixture'});await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});})()`);
    assert.equal((await state('activity-dot-chat-fixture')).revision, 'updated');
    await page('activity-dot-before-reload');
    assert.equal((await state('activity-dot-before-reload')).revision, 'registered');
  });
  await test('Reload registers the updated code and upgrades existing tabs', async () => {
    await workerClient.eval('setTimeout(()=>chrome.runtime.reload(),50)');
    let replacement;
    for (let i=0;i<60;i++) {
      await wait(100);
      replacement=(await browser.send('Target.getTargets')).targetInfos.find(target=>target.type==='service_worker' && target.url.endsWith('/background.js') && target.targetId!==worker.targetId);
      if(replacement) break;
    }
    assert.ok(replacement, 'Replacement extension service worker started');
    workerClient = new CDP(`ws://127.0.0.1:${port}/devtools/page/${replacement.targetId}`);
    await until(workerClient, 'typeof chrome !== "undefined" && !!chrome.runtime?.id');
    assert.equal(await workerClient.eval('chrome.runtime.getManifest().version'), '1.0.99');
    await wait(500);
    assert.equal((await state('activity-dot-before-reload')).revision, 'updated');
    assert.equal((await state('activity-dot-chat-fixture')).revision, 'updated');
    assert.equal(await first.eval(overlay),1);
    await first.send('Page.bringToFront');
    await first.eval('document.getElementById("stop").remove()');
    await until(first, `${overlay} === 0`);
  });
  await test('A new tab after reload completes, turns green in the background, and clears when read', async () => {
    const fresh=await page('activity-dot-after-reload');
    assert.equal((await state('activity-dot-after-reload')).revision,'updated');
    assert.equal((await state('activity-dot-after-reload')).state.unreadColor,'#65D6A0');
    await fresh.send('Page.bringToFront');
    await fresh.eval(stop); await until(fresh,`${overlay} === 1`);
    assert.deepEqual(await dotColor(fresh),[145,172,242,255]);
    await first.send('Page.bringToFront');
    await fresh.eval('document.getElementById("stop").remove()');
    const end=Date.now()+6000;
    while((await dotColor(fresh))?.join(',')!=='101,214,160,255' && Date.now()<end) await wait(100);
    assert.deepEqual(await dotColor(fresh),[101,214,160,255]);
    await fresh.send('Page.bringToFront'); await until(fresh,`${overlay} === 0`);
    await until(workerClient, `(async()=>{const [tab]=await chrome.tabs.query({url:'https://chatgpt.com/c/activity-dot-after-reload'});return tab.favIconUrl===${JSON.stringify(baseIcon)}})()`);
  });
  assert.equal(external.filter(url=>!url.endsWith('/favicon.ico')).length,0);
  console.log(`PASS ${cases.length}/${cases.length} upgrade scenarios`);
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => {
  fs.writeFileSync(reportPath, JSON.stringify({
    date: new Date().toISOString(), browser: browserVersion?.product, source: 'Real browser with unpacked extension; synthetic ChatGPT DOM fixtures',
    liveChatGPTVerified: false, cases, externalRequests: external, success: !process.exitCode
  }, null, 2));
  if (browser) await browser.send('Browser.close').catch(() => {});
  for (const socket of sockets) socket.close();
  if (child && !child.killed) child.kill();
  console.log('Report: ' + reportPath);
  // Only this script's isolated profile is eligible for cleanup.
  if (profile) { await wait(300); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }
  setTimeout(() => process.exit(process.exitCode || 0), 100);
});
