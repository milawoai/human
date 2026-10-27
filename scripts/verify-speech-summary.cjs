/* Real desktop + configured model + installed TTS. No tools are offered to the model. */
const assert = require('node:assert/strict')
const WebSocket = require('ws')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function targets() { return (await fetch('http://127.0.0.1:19222/json/list')).json() }
async function until(check, label, timeout = 240_000) {
  const start = Date.now()
  while (Date.now() - start < timeout) { const value = await check(); if (value) return value; await delay(200) }
  throw new Error(`Timed out: ${label}`)
}
async function attach(target) {
  assert.ok(target, 'Missing Electron CDP target')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })
  let id = 0
  const pending = new Map()
  ws.on('message', raw => {
    const data = JSON.parse(raw), call = pending.get(data.id)
    if (!call) return
    pending.delete(data.id)
    clearTimeout(call.timer)
    data.error ? call.reject(data.error) : call.resolve(data.result)
  })
  const evaluate = async expression => {
    const result = await new Promise((resolve, reject) => {
      const key = ++id
      const timer = setTimeout(() => { pending.delete(key); reject(new Error('CDP evaluation timeout')) }, 250_000)
      pending.set(key, { resolve, reject, timer })
      ws.send(JSON.stringify({ id: key, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }))
    })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  return { ws, evaluate }
}

async function verifyExpiredLease(pet) {
  const before = await pet.evaluate(`window.__speechPlayed`)
  const result = await pet.evaluate(`(async () => {
    const ticket={scope:'chat-panel',token:'verification-expired-lease'};
    await window.electron.ipcRenderer.invoke('live2d-setSpeechPlaybackState',ticket);
    await window.electron.ipcRenderer.invoke('live2d-setSpeechPlaybackState',{scope:'chat-panel',token:''});
    return window.electron.ipcRenderer.invoke('live2d-perform',{text:'过期语音不应播放。',audioUrl:window.__speechAudio.src,speechPlayback:ticket});
  })()`)
  assert.equal(result.data?.audioPlayed, false)
  assert.equal(await pet.evaluate(`window.__speechPlayed`), before)
  console.log('Expired playback lease rejected through actual IPC without starting audio: PASS')
}

async function main() {
  const clients = []
  const connect = async target => { const client = await attach(target); clients.push(client); return client }
  try {
    if (process.argv.includes('--lease-only')) {
      await verifyExpiredLease(await connect((await targets()).find(t => t.url.endsWith('#/pet'))))
      return
    }
    if (process.argv.includes('--inspect')) {
      for (const target of (await targets()).filter(t => /#\/(pet|chat-panel|agent-panel)$/.test(t.url))) {
        const client = await connect(target)
        console.log(target.url, await client.evaluate(`({text:document.body.innerText.slice(-5000),audio:window.__speechAudio && {time:window.__speechAudio.currentTime,paused:window.__speechAudio.paused},plays:window.__speechPlayed,rms:window.__speechRms})`))
      }
      return
    }
    if (!(await targets()).some(t => t.url.endsWith('#/pet'))) {
      const existing = await connect((await targets()).find(t => t.type === 'page'))
      await existing.evaluate(`window.electron.ipcRenderer.invoke('live2d-openWindow')`)
    }
    const pet = await connect(await until(async () => (await targets()).find(t => t.url.endsWith('#/pet')), 'Live2D pet'))
    await pet.evaluate(`(() => {
      window.__speechPlayed = 0; window.__speechRms = 0;
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function(...args) { window.__speechPlayed++; window.__speechAudio = this; return play.apply(this, args) };
      const analyse = AnalyserNode.prototype.getByteTimeDomainData;
      AnalyserNode.prototype.getByteTimeDomainData = function(data) { analyse.call(this, data); window.__speechRms = Math.max(window.__speechRms, ...Array.from(data, v => Math.abs(v - 128))); };
      document.querySelector('.pet-agent-launcher').click();
    })()`)
    const agent = await connect(await until(async () => (await targets()).find(t => t.url.endsWith('#/agent-panel')), 'Agent panel'))
    await until(() => agent.evaluate(`!!document.querySelector('input[type=checkbox]')`), 'Agent summary switch')
    await agent.evaluate(`document.querySelector('.controls button').click()`)
    assert.equal(await agent.evaluate(`document.querySelector('input[type=checkbox]').checked`), false)
    await agent.evaluate(`document.querySelector('input[type=checkbox]').click()`)
    const session = await agent.evaluate(`document.querySelector('.session-id').textContent.trim().split(' ').pop()`)
    await agent.evaluate(`(() => {const field = document.querySelector('textarea'); field.value='请用一句话说明你能帮我做什么，不要使用工具。'; field.dispatchEvent(new Event('input', {bubbles:true}));})()`)
    await agent.evaluate(`document.querySelector('form').requestSubmit()`)
    await until(() => agent.evaluate(`document.querySelector('button[type=submit]').textContent.trim() !== '执行中…'`), 'real Agent summary and TTS')
    assert.equal(await agent.evaluate(`document.querySelector('[role=alert]')?.textContent || ''`), '')
    const notices = await agent.evaluate(`Array.from(document.querySelectorAll('.notice')).map(e=>e.textContent).join(' ')`)
    assert.equal(notices, '', notices)
    assert.ok(!(await agent.evaluate(`document.querySelector('.messages').textContent`)).includes('human_speech_summary'))
    await until(() => pet.evaluate(`window.__speechAudio?.currentTime > 0 && window.__speechRms > 1`), 'real audio progress and lip-sync signal')
    const audio = await pet.evaluate(`({url:window.__speechAudio.src,time:window.__speechAudio.currentTime,rms:window.__speechRms,plays:window.__speechPlayed,subtitle:document.querySelector('.pet-status-badge small')?.textContent})`)
    assert.ok(audio.subtitle && Array.from(audio.subtitle).length <= 80, 'short summary subtitle is visible')
    const response = await fetch(audio.url)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
    const bytes = Buffer.from(await response.arrayBuffer())
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF')
    assert.ok(bytes.length > 44)
    console.log('Agent real model → summary → plugin → audio/subtitle/lip-sync: PASS', JSON.stringify(audio))
    await agent.evaluate(`document.querySelector('.controls button').click()`)
    assert.equal(await agent.evaluate(`document.querySelector('input[type=checkbox]').checked`), false)
    await agent.evaluate(`(() => {const select=document.querySelector('[aria-label="恢复会话"]'); select.value=${JSON.stringify(session)}; select.dispatchEvent(new Event('change',{bubbles:true}));})()`)
    await until(() => agent.evaluate(`document.querySelector('input[type=checkbox]').checked`), 'restored per-session enabled switch')
    await agent.evaluate(`document.querySelector('input[type=checkbox]').click()`)
    await agent.evaluate(`document.querySelector('.controls button').click()`)
    await agent.evaluate(`(() => {const select=document.querySelector('[aria-label="恢复会话"]'); select.value=${JSON.stringify(session)}; select.dispatchEvent(new Event('change',{bubbles:true}));})()`)
    await until(() => agent.evaluate(`document.querySelectorAll('.message').length > 0`), 'restored messages')
    assert.equal(await agent.evaluate(`document.querySelector('input[type=checkbox]').checked`), false)
    console.log('Agent new session default off, enabled restoration, explicit off persistence: PASS')

    await pet.evaluate(`window.electron.ipcRenderer.invoke('sense-openChatPanel')`)
    const chat = await connect(await until(async () => (await targets()).find(t => t.url.endsWith('#/chat-panel')), 'chat panel'))
    await until(() => chat.evaluate(`!!document.querySelector('input[type=checkbox]')`), 'chat summary switch')
    await chat.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('新会话')).click()`)
    assert.equal(await chat.evaluate(`document.querySelector('input[type=checkbox]').checked`), false)
    await chat.evaluate(`document.querySelector('input[type=checkbox]').click()`)
    const before = await pet.evaluate(`window.__speechPlayed`)
    await chat.evaluate(`(() => {const field=document.querySelector('.input-wrapper textarea'); field.value='请用一句话解释今天的语音测试目的。'; field.dispatchEvent(new Event('input',{bubbles:true}));})()`)
    await chat.evaluate(`document.querySelector('.send-btn').click()`)
    await until(async () => {
      const failure = await chat.evaluate(`document.querySelector('.input-area [role=status]')?.textContent || document.querySelector('.error-msg')?.textContent || ''`)
      if (failure) throw new Error(`Cortex: ${failure}`)
      return pet.evaluate(`window.__speechPlayed > ${before}`)
    }, 'Cortex automatic short-summary playback')
    assert.equal(await chat.evaluate(`document.querySelector('.error-msg')?.textContent || ''`), '')
    await chat.evaluate(`document.querySelector('input[type=checkbox]').click()`)
    console.log('Cortex real chat → summary → automatic playback: PASS')

    await verifyExpiredLease(pet)
  } finally { for (const client of clients) client.ws.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
