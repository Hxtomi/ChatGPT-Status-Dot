'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../extension/popup.js'), 'utf8');
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
async function harness() {
  const elements = Object.fromEntries(['enabled', 'status', 'reset', 'color', 'doneColor'].map(id => [id, {
    checked: false, disabled: true, value: '', textContent: '', parentElement: { dataset: {} },
    listeners: {}, addEventListener(name, listener) { this.listeners[name] = listener; }
  }]));
  const intervals = new Set(); const events = {};
  let state = { busy: true, unread: false }; let next;
  const document = { hidden: false, body: { dataset: {} }, documentElement: { style: { setProperty() {} } }, getElementById: id => elements[id] };
  const chrome = { storage: { local: { get: async defaults => ({ ...defaults }), set: async () => {} } },
    tabs: { query: async () => [{ id: 7 }], sendMessage: async () => next ? next() : { ...state } } };
  vm.runInNewContext(source, { document, chrome, window: { addEventListener: (name, fn) => { events[name] = fn; } },
    setInterval: fn => { intervals.add(fn); return fn; }, clearInterval: fn => intervals.delete(fn) });
  await settle();
  return { elements, events, intervals, document, state: value => { state = value; }, next: fn => { next = fn; },
    tick: async () => { for (const fn of intervals) fn(); await settle(); } };
}
test('an open popup follows Working -> Done -> Idle without changing settings', async () => {
  const h = await harness();
  assert.equal(h.elements.status.textContent, 'ChatGPT is working');
  h.state({ busy: false, unread: true }); await h.tick();
  assert.equal(h.elements.status.textContent, 'Response ready');
  assert.equal(h.elements.status.parentElement.dataset.state, 'done');
  h.state({ busy: false, unread: false }); await h.tick();
  assert.equal(h.elements.status.textContent, 'No response in progress');
});
test('a delayed Working reply cannot overwrite Indicator is off', async () => {
  const h = await harness(); let reply;
  h.next(() => new Promise(resolve => { reply = resolve; })); await h.tick();
  assert.equal(typeof reply, 'function');
  h.elements.enabled.checked = false; await h.elements.enabled.listeners.change();
  reply({ busy: true, unread: false }); await settle();
  assert.equal(h.elements.status.textContent, 'Indicator is off');
  assert.equal(h.elements.status.parentElement.dataset.state, 'off');
});
test('hidden popup suspends polling and pagehide clears its interval', async () => {
  const h = await harness(); h.document.hidden = true;
  h.state({ busy: false, unread: true }); await h.tick();
  assert.equal(h.elements.status.textContent, 'ChatGPT is working');
  h.events.pagehide(); assert.equal(h.intervals.size, 0);
});
