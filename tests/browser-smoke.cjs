/* Real Chromium browser + unpacked extension; synthetic pages, no account required. */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const project = path.resolve(__dirname, '..');
const extension = path.join(project, 'extension');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const cases = [];
const external = [];
const sockets = [];
const reportPath = path.join(project, 'artifacts', 'browser-test-report.json');

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
  const workerClient = new CDP(`ws://127.0.0.1:${port}/devtools/page/${worker.targetId}`);
  const stop = 'document.getElementById("composer").insertAdjacentHTML("beforeend",\'<button id="stop" type="button" data-testid="stop-button" aria-label="Stop streaming">Stop</button>\')';
  await test('Idle page keeps the native icon', async () => assert.equal(await first.eval(overlay), 0));
  await test('Chat streaming shows one bottom-right Working badge', async () => {
    await first.eval(stop); await until(first, `${overlay} === 1`);
    const rgba = await first.eval(`(async()=>{const i=new Image();i.src=document.getElementById('chatgpt-activity-dot-favicon').href;await i.decode();const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.drawImage(i,0,0);return [...x.getImageData(50,50,1,1).data]})()`);
    assert.deepEqual(rgba, [145, 172, 242, 255]);
    const activeIcon = await first.eval('document.getElementById("chatgpt-activity-dot-favicon").href');
    await until(workerClient, `(async()=>{const [tab]=await chrome.tabs.query({url:'https://chatgpt.com/c/activity-dot-chat-fixture'});return tab.favIconUrl===${JSON.stringify(activeIcon)}})()`);
  });
  await test('Finishing restores the original icon without editing it', async () => {
    await first.eval('document.getElementById("stop").remove()'); await until(first, `${overlay} === 0`);
    assert.equal(await first.eval('document.getElementById("native").href'), baseIcon);
    await until(workerClient, `(async()=>{const [tab]=await chrome.tabs.query({url:'https://chatgpt.com/c/activity-dot-chat-fixture'});return tab.favIconUrl===${JSON.stringify(baseIcon)}})()`);
  });
  await test('Message text, hidden stop controls and audio Stop do not trigger', async () => {
    await first.eval(`document.getElementById('messages').innerHTML='<p>Stop generating. Остановить генерацию.</p><button hidden data-testid="stop-button">Stop</button><button aria-label="Stop recording">Stop</button><button aria-label="Stop">Stop</button>'`);
    await wait(700); assert.equal(await first.eval(overlay), 0);
  });
  await test('Work composer Stop is detected', async () => {
    await first.eval(`document.getElementById('composer').insertAdjacentHTML('beforeend','<button id="work-stop" type="button" aria-label="Stop">Stop</button>')`);
    await until(first, `${overlay} === 1`);
  });
  await test('Short thinking/tool handover does not flicker', async () => {
    await first.eval(`document.getElementById('work-stop').remove();setTimeout(()=>{${stop}},180)`);
    await wait(260); assert.equal(await first.eval(overlay), 1);
  });
  await test('Site replacement of the favicon is preserved when work ends', async () => {
    const nextIcon = baseIcon.replace('data:image/svg+xml', 'data:image/svg+xml;charset=utf-8');
    await first.eval(`document.getElementById('native').href=${JSON.stringify(nextIcon)}`);
    await wait(250); assert.equal(await first.eval(overlay), 1);
    await first.eval('document.getElementById("stop").remove()'); await until(first, `${overlay} === 0`);
    assert.equal(await first.eval('document.getElementById("native").href'), nextIcon);
  });
  await test('A second conversation has independent status', async () => {
    await first.eval(stop); await until(first, `${overlay} === 1`);
    const second = await page('activity-dot-work-fixture'); await wait(350);
    assert.equal(await second.eval(overlay), 0);
    assert.equal(await first.eval(overlay), 1);
    await first.send('Page.bringToFront');
    await until(first, 'document.hasFocus()');
  });
  await test('Site removal of our icon recovers while still running', async () => {
    await first.eval('document.getElementById("chatgpt-activity-dot-favicon").remove()');
    await until(first, `${overlay} === 1`);
  });
  await test('Disabling and recoloring work in an existing busy tab', async () => {
    await workerClient.eval('chrome.storage.local.set({enabled:false})'); await until(first, `${overlay} === 0`);
    await workerClient.eval('chrome.storage.local.set({enabled:true,color:"#A9C5D9"})'); await until(first, `${overlay} === 1`);
    const rgba = await first.eval(`(async()=>{const i=new Image();i.src=document.getElementById('chatgpt-activity-dot-favicon').href;await i.decode();const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.drawImage(i,0,0);return [...x.getImageData(50,50,1,1).data]})()`);
    assert.deepEqual(rgba, [169,197,217,255]);
  });
  await test('Repeated injection leaves one indicator and no duplicate state', async () => {
    await workerClient.eval(`(async()=>{const tabs=await chrome.tabs.query({url:'https://chatgpt.com/c/activity-dot-chat-fixture'});await chrome.scripting.executeScript({target:{tabId:tabs[0].id},files:['content.js']});})()`);
    await until(first, `${overlay} === 1`); await wait(200); assert.equal(await first.eval(overlay), 1);
    await first.eval('document.getElementById("stop").remove()'); await until(first, `${overlay} === 0`);
  });
  await test('Manual Stop clears the actual favicon even if its old control lingers', async () => {
    await workerClient.eval('chrome.storage.local.set({color:"#91ACF2"})');
    const original = await first.eval('document.getElementById("native").href');
    await first.eval(stop); await until(first, `${overlay} === 1`);
    await first.eval('document.getElementById("stop").click()');
    await until(first, `${overlay} === 0`); await wait(700); assert.equal(await first.eval(overlay), 0);
    await until(workerClient, `(async()=>{const [tab]=await chrome.tabs.query({url:'https://chatgpt.com/c/activity-dot-chat-fixture'});return tab.favIconUrl===${JSON.stringify(original)}})()`);
    await first.eval('document.getElementById("stop").remove()'); await wait(150);
    await first.eval(stop); await until(first, `${overlay} === 1`);
    await first.eval('document.getElementById("stop").remove()'); await until(first, `${overlay} === 0`);
  });
  await test('Background completion becomes green; opening the chat clears it', async () => {
    const original = await first.eval('document.getElementById("native").href');
    await first.eval(stop); await until(first, `${overlay} === 1`);
    const other = await page('activity-dot-unread-fixture');
    await other.send('Page.bringToFront'); await until(first, '!document.hasFocus()');
    await first.eval('document.getElementById("stop").remove()');
    // Background tabs have browser-throttled timers; wait for the actual state.
    await until(first, `(async()=>{const link=document.getElementById('chatgpt-activity-dot-favicon');if(!link)return false;const i=new Image();i.src=link.href;await i.decode();const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.drawImage(i,0,0);const p=x.getImageData(50,50,1,1).data;return p[0]===101&&p[1]===214&&p[2]===160})()`, 6000);
    assert.equal(await first.eval(overlay), 1);
    const rgba = await first.eval(`(async()=>{const i=new Image();i.src=document.getElementById('chatgpt-activity-dot-favicon').href;await i.decode();const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.drawImage(i,0,0);return [...x.getImageData(50,50,1,1).data]})()`);
    assert.deepEqual(rgba, [101,214,160,255]);
    await first.send('Page.bringToFront'); await until(first, `${overlay} === 0`);
    await until(workerClient, `(async()=>{const [tab]=await chrome.tabs.query({url:'https://chatgpt.com/c/activity-dot-chat-fixture'});return tab.favIconUrl===${JSON.stringify(original)}})()`);
  });
  await test('Done color updates in an unread tab and settings removal restores defaults', async () => {
    await first.eval(stop); await until(first, `${overlay} === 1`);
    const other = await page('activity-dot-custom-done');
    await other.send('Page.bringToFront'); await until(first, '!document.hasFocus()');
    await first.eval('document.getElementById("stop").remove()');
    await workerClient.eval('chrome.storage.local.set({doneColor:"#CC88AA"})');
    const pixel = `(async()=>{const link=document.getElementById('chatgpt-activity-dot-favicon');if(!link)return '';const i=new Image();i.src=link.href;await i.decode();const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.drawImage(i,0,0);return [...x.getImageData(50,50,1,1).data].join(',')})()`;
    await until(first, `${pixel}.then(p=>p==='204,136,170,255')`, 6000);
    await workerClient.eval('chrome.storage.local.remove("doneColor")');
    await until(first, `${pixel}.then(p=>p==='101,214,160,255')`, 6000);
    await first.send('Page.bringToFront'); await until(first, `${overlay} === 0`);
  });
  await test('Popup saves both colors, disabled state, and reset defaults', async () => {
    const origin = worker.url.slice(0, worker.url.lastIndexOf('/'));
    const { targetId } = await browser.send('Target.createTarget', { url: `${origin}/popup.html` });
    const popup = new CDP(`ws://127.0.0.1:${port}/devtools/page/${targetId}`);
    await until(popup, 'document.readyState === "complete" && !!document.getElementById("status") && document.getElementById("status").textContent !== "Checking current tab…"');
    await popup.eval(`for (const [id,value] of [['color','#aabbcc'],['doneColor','#bbccdd']]) {const i=document.getElementById(id);i.value=value;i.dispatchEvent(new Event('change'));} document.getElementById('enabled').click()`);
    await until(workerClient, `(async()=>{const s=await chrome.storage.local.get(null);return s.color==='#aabbcc'&&s.doneColor==='#bbccdd'&&s.enabled===false})()`);
    await popup.eval('document.getElementById("reset").click()');
    await until(workerClient, `(async()=>{const s=await chrome.storage.local.get(null);return s.color==='#91ACF2'&&s.doneColor==='#65D6A0'&&s.enabled===true})()`);
    const stored = await workerClient.eval('chrome.storage.local.get(null)');
    assert.deepEqual(Object.keys(stored).sort(), ['color','doneColor','enabled']);
    await browser.send('Target.closeTarget', { targetId });
    await first.send('Page.bringToFront');
  });
  await test('SPA body replacement and Russian stop labels are detected', async () => {
    await first.eval(`history.pushState({},'', '/c/new-fixture');document.body.innerHTML='<main><form><button aria-label="Остановить генерацию">Стоп</button></form></main>'`);
    await until(first, `${overlay} === 1`);
    await first.eval(`document.body.innerHTML='<main><form><button>Отправить</button></form></main>'`);
    await until(first, `${overlay} === 0`);
  });
  await workerClient.eval('chrome.storage.local.set({enabled:true,color:"#91ACF2"})');
  const count = external.filter(url => !url.endsWith('/favicon.ico')).length;
  assert.equal(count, 0, 'No conversation/API/analytics traffic from extension in test');
  console.log(`PASS ${cases.length}/${cases.length} browser scenarios; no unexpected network requests`);
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
