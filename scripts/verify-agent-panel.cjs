/* Read-only desktop checks plus two no-tools model turns. Run with Electron CDP on 19222. */
const assert = require('node:assert/strict')
const { writeFileSync } = require('node:fs')
const WebSocket = require('ws')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function attach(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })
  let id = 0
  const pending = new Map()
  ws.on('message', raw => {
    const data = JSON.parse(raw)
    const call = pending.get(data.id)
    if (!call) return
    pending.delete(data.id)
    data.error ? call.reject(data.error) : call.resolve(data.result)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id
    pending.set(key, { resolve, reject })
    ws.send(JSON.stringify({ id: key, method, params }))
  })
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  return { ws, send, evaluate }
}

async function targets() { return (await fetch('http://127.0.0.1:19222/json/list')).json() }
async function until(check, label, timeout = 60_000) {
  const start = Date.now()
  while (Date.now() - start < timeout) { const value = await check(); if (value) return value; await delay(250) }
  throw new Error(`Timed out: ${label}`)
}

async function main() {
  const pet = await attach((await targets()).find(t => t.url.endsWith('#/pet')))
  let panel
  try {
    assert.equal(await pet.evaluate(`document.querySelectorAll('.pet-agent-launcher').length`), 1)
    await pet.evaluate(`document.querySelector('.pet-agent-launcher').click()`)
    const target = await until(async () => (await targets()).find(t => t.url.endsWith('#/agent-panel')), 'Agent window')
    panel = await attach(target)
    const { evaluate, send } = panel
    await until(() => evaluate(`!!document.querySelector('textarea')`), 'Agent form')
    await evaluate(`document.querySelector('.controls button').click()`)
    assert.equal(await evaluate(`document.querySelector('[aria-label="工具模式"]').value`), 'none')
    assert.equal(await evaluate(`document.querySelector('button[type="submit"]').disabled`), true)
    const sessionId = await evaluate(`document.querySelector('.session-id').textContent.trim().split(' ').pop()`)
    const setTask = text => evaluate(`(() => { const input=document.querySelector('textarea'); input.value=${JSON.stringify(text)}; input.dispatchEvent(new Event('input',{bubbles:true})); })()`)
    await setTask('请记住本次测试代号是蓝鲸七号。仅回复：已记住蓝鲸七号。不要使用工具。')
    await evaluate(`document.querySelector('form').requestSubmit()`)
    assert.equal(await evaluate(`document.querySelector('button[type="submit"]').disabled`), true)
    await until(() => evaluate(`document.querySelector('button[type="submit"]').textContent.trim() !== '执行中…'`), 'first model turn', 120_000)
    const first = await evaluate(`({ error:document.querySelector('[role="alert"]')?.textContent, text:document.querySelector('.messages').textContent, status:document.querySelector('[role="status"]').textContent })`)
    console.log('first turn', JSON.stringify(first))
    assert.ok(!first.error, first.error)
    assert.match(first.text, /蓝鲸七号/)
    assert.equal(first.status, '已完成')
    await setTask('刚才的测试代号是什么？仅回答代号，不要使用工具。')
    await evaluate(`document.querySelector('form').requestSubmit()`)
    await until(() => evaluate(`document.querySelector('button[type="submit"]').textContent.trim() !== '执行中…'`), 'second model turn', 120_000)
    assert.equal(await evaluate(`document.querySelector('[role="alert"]')?.textContent || ''`), '')
    const last = await evaluate(`Array.from(document.querySelectorAll('.message.assistant pre')).at(-1)?.textContent`)
    assert.match(last, /蓝鲸七号/)
    console.log('multi-turn memory', last)
    await evaluate(`document.querySelector('.controls button').click()`)
    assert.equal(await evaluate(`document.querySelectorAll('.message').length`), 0)
    await evaluate(`(() => {const select=document.querySelector('[aria-label="恢复会话"]'); select.value=${JSON.stringify(sessionId)}; select.dispatchEvent(new Event('change',{bubbles:true}));})()`)
    await until(() => evaluate(`document.querySelectorAll('.message').length >= 4`), 'restored history')
    assert.equal(await evaluate(`document.querySelector('[aria-label="工具模式"]').value`), 'none')
    await evaluate(`(() => { const input=document.querySelector('[aria-label="模型 profile"]'); input.value='agent-panel-missing-profile'; input.dispatchEvent(new Event('input',{bubbles:true})); })()`)
    await setTask('测试无效模型配置，不要调用工具。')
    await evaluate(`document.querySelector('form').requestSubmit()`)
    await until(() => evaluate(`document.querySelector('[role="status"]').textContent === '执行失败'`), 'invalid profile error')
    assert.match(await evaluate(`document.querySelector('[role="alert"]').textContent`), /agent-panel-missing-profile/)
    assert.equal(await evaluate(`document.querySelector('button[type="submit"]').disabled`), false)
    await evaluate(`document.querySelector('.controls button').click()`)
    await evaluate(`(() => {const select=document.querySelector('[aria-label="恢复会话"]'); select.value=${JSON.stringify(sessionId)}; select.dispatchEvent(new Event('change',{bubbles:true}));})()`)
    await until(() => evaluate(`document.querySelectorAll('.message').length >= 4`), 'restore after failure')
    const screenshot = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync('/private/tmp/human-agent-panel.png', Buffer.from(screenshot.data, 'base64'))
    console.log('PASS: Live2D entry, no-tools default, real model turns, busy lock, shared session memory, history restoration and invalid-profile recovery.', sessionId)
  } finally { panel?.ws.close(); pet.ws.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
