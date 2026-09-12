// Pilote la ceremonie Genesis DEPUIS l'application empaquetee, via le protocole
// DevTools de Chromium (--remote-debugging-port), sans cliquer dans l'UI.
// Il appelle window.electron.genesis.start(name) — exactement ce que fait
// GenesisAnimation.tsx — et collecte les evenements genesis:event que main.js
// renvoie au renderer. Node 22 : WebSocket est global, aucune dependance.
//
// Usage : node appimage-genesis-driver.mjs <port> <nom-de-vault> [timeout-s]
const port = process.argv[2] || '9222';
const name = process.argv[3] || 'AppImageVerify';
const timeoutS = Number(process.argv[4] || 300);

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
if (!page) throw new Error('aucune page CDP : ' + JSON.stringify(targets));
console.log('page:', page.url);

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const call = (method, params = {}) => new Promise((res) => {
  const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression, awaitPromise = false) => {
  const r = await call('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};

const api = await evaluate('typeof window.electron?.genesis?.start');
console.log('window.electron.genesis.start:', api);
if (api !== 'function') { ws.close(); process.exit(3); }

await evaluate(`(() => { window.__genesisEvents = []; window.electron.genesis.onEvent((p) => window.__genesisEvents.push(p)); return true; })()`);
const started = await evaluate(`window.electron.genesis.start(${JSON.stringify(name)})`, true);
console.log('start ->', JSON.stringify(started));

const deadline = Date.now() + timeoutS * 1000;
let seen = 0; let finalEvent = null;
while (Date.now() < deadline) {
  const events = await evaluate('JSON.stringify(window.__genesisEvents)');
  const list = JSON.parse(events || '[]');
  for (; seen < list.length; seen++) {
    const e = list[seen];
    const d = e.data || {};
    const line = e.event === 'phase'
      ? `phase ${d.phase ?? ''} ${d.label ?? d.status ?? ''} ${d.message ?? ''}`.trim()
      : `${e.event} ${JSON.stringify(d).slice(0, 160)}`;
    console.log('  ', line);
    if (e.event === 'exit' || e.event === 'done' || e.event === 'error' || e.event === 'end') finalEvent = e;
  }
  if (finalEvent) break;
  await new Promise((r) => setTimeout(r, 1500));
}
ws.close();
if (!finalEvent) { console.log('TIMEOUT sans evenement final'); process.exit(4); }
console.log('final:', JSON.stringify(finalEvent).slice(0, 400));
