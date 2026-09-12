// Reprend la collecte des evenements genesis:event deja accumules dans
// window.__genesisEvents par le pilote, en se reconnectant a chaque coupure
// du WebSocket CDP. Ne relance PAS la ceremonie.
// Usage : node appimage-genesis-poll.mjs <port> [timeout-s]
const port = process.argv[2] || '9222';
const timeoutS = Number(process.argv[3] || 300);
const deadline = Date.now() + timeoutS * 1000;
let seen = 0; let finalEvent = null;

async function connect() {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0; const pending = new Map();
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
  ws.onclose = () => { for (const res of pending.values()) res({ closed: true }); pending.clear(); };
  const evaluate = (expression) => new Promise((res) => {
    const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  });
  return { ws, evaluate };
}

while (Date.now() < deadline && !finalEvent) {
  let conn;
  try { conn = await connect(); } catch (e) { console.log('reconnexion...', String(e).slice(0, 80)); await new Promise((r) => setTimeout(r, 2000)); continue; }
  while (Date.now() < deadline && !finalEvent) {
    const r = await conn.evaluate('JSON.stringify(window.__genesisEvents || [])');
    if (r.closed) { console.log('(websocket ferme, reconnexion)'); break; }
    const list = JSON.parse(r.result?.result?.value || '[]');
    for (; seen < list.length; seen++) {
      const e = list[seen]; const d = e.data || {};
      console.log('  ', e.event === 'phase' ? `phase ${d.phase ?? ''} ${d.label ?? ''} ${d.message ?? ''}`.trim() : `${e.event} ${JSON.stringify(d).slice(0, 200)}`);
      if (['done', 'error', 'exit', 'end'].includes(e.event)) finalEvent = e;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  try { conn.ws.close(); } catch {}
}
if (!finalEvent) { console.log('TIMEOUT sans evenement final'); process.exit(4); }
console.log('final:', JSON.stringify(finalEvent).slice(0, 500));
