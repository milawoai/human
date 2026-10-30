/* Deterministic Electron UI E2E. Requires agent-run-desktop-fixture on 12002 and Electron CDP 19222. */
const assert = require('node:assert/strict')
const WebSocket = require('ws')
const delay = ms => new Promise(r => setTimeout(r, ms))
async function until(fn, label) {
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) { const result = await fn(); if (result) return result; await delay(150) }
  throw Error(`Timeout: ${label}`)
}
async function attach(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })
  let id = 0
  const pending = new Map()
  ws.on('message', raw => { const r = JSON.parse(raw); const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(Error(JSON.stringify(r.error))) : p.resolve(r.result) } })
  const evaluate = async expression => {
    const result = await new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); ws.send(JSON.stringify({ id: key, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } })) })
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  return { ws, evaluate }
}
async function main() {
  let pet, panel
  const health = await fetch('http://127.0.0.1:12002/health')
  assert.equal(health.headers.get('x-human-test-fixture'), 'agent-run-management', 'Refusing to send fixture tasks to a real backend')
  const targets = async () => (await fetch('http://127.0.0.1:19222/json/list')).json()
  try {
    pet = await attach((await targets()).find(t => t.url.endsWith('#/pet')))
    await pet.evaluate(`document.querySelector('.pet-agent-launcher').click()`)
    panel = await attach(await until(async () => (await targets()).find(t => t.url.endsWith('#/agent-panel')), 'panel'))
    const e = panel.evaluate
    await until(() => e(`!!document.querySelector('textarea')`), 'form')
    await e(`document.querySelector('.controls button').click()`)
    await e(`(()=>{const t=document.querySelector('textarea');t.value='wait fixture';t.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('form').requestSubmit()})()`)
    await until(() => e(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='停止任务' && !b.disabled)`), 'stop button')
    const sessionId = await e(`document.querySelector('.session-id').textContent.trim().split(' ').pop()`)
    const query = async () => (await fetch('http://127.0.0.1:12002/neural/trigger', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'query', topic: 'brain.agent.run.get', payload: { sessionId } }) })).json()
    assert.equal((await query()).data.run.status, 'running')
    await e(`location.reload()`)
    await until(() => e(`document.querySelector('[role="status"]')?.textContent==='运行中'`), 'reload observes same running task')
    assert.equal(await e(`document.querySelector('.session-id').textContent.trim().split(' ').pop()`), sessionId)
    await e(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='停止任务').click()`)
    await until(() => e(`document.querySelector('[role="status"]')?.textContent==='已取消'`), 'confirmed cancellation')
    assert.equal((await query()).data.run.status, 'cancelled')
    assert.equal(await e(`document.querySelector('button[type="submit"]').disabled`), true)
    await e(`(()=>{const t=document.querySelector('textarea');t.value='complete fixture';t.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('form').requestSubmit()})()`)
    await until(() => e(`document.querySelector('[role="status"]')?.textContent==='已完成'`), 'next run completes')
    assert.equal((await query()).data.run.status, 'succeeded')
    console.log('PASS Electron UI: server running → reload/observe same run → stop → confirmed cancelled → next run succeeded. No cloud model or side-effect tool was used.')
  } finally {
    if (panel) await panel.evaluate(`localStorage.removeItem('human:agent:last-session');localStorage.removeItem('human:agent:last-run')`).catch(() => {})
    panel?.ws.close(); pet?.ws.close()
  }
}
main().catch(e => { console.error(e); process.exitCode = 1 })
