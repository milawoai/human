import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { defineHandlers } from '../../apps/body/src/shared/datas/ipc'
import { themeDefinitions } from '../../apps/body/src/shared/theme'
app.setPath('userData', process.env.HUMAN_TEST_USER_DATA!)
const root = process.env.HUMAN_TEST_ROOT!
const pages = [
  ['pet-settings', '.pet-settings-page'], ['config', '.config-page'], ['hello', '.hello-content'],
  ['pet', '.pet-stage'], ['hearing-panel', '.hearing-panel'], ['chat-panel', '.chat-panel-container'], ['agent-panel', '.agent-panel']
]
const windows: BrowserWindow[] = []
const rgb = (value: string) => 'rgb(' + [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16)).join(', ') + ')'
async function read(window: BrowserWindow, selector: string) {
  return window.webContents.executeJavaScript(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)}), root = document.documentElement;
    if (!el) return null;
    const style = getComputedStyle(el);
    return { theme: root.dataset.humanTheme, fontSize: getComputedStyle(root).fontSize,
      color: style.color, background: style.backgroundColor, fontFamily: style.fontFamily,
      bodyBackground: getComputedStyle(document.body).backgroundColor, scheme: getComputedStyle(root).colorScheme };
  })()`)
}
async function create(page: string, selector: string) {
  const window = new BrowserWindow({ show: false, width: 1100, height: 820, transparent: ['hello', 'pet'].includes(page),
    webPreferences: { preload: join(root, 'apps/body/out/preload/index.js'), sandbox: false } })
  windows.push(window)
  await window.loadFile(join(root, 'apps/body/out/renderer/index.html'), { hash: `/${page}` })
  for (let i = 0; i < 100; i++) { if (await read(window, selector)) return window; await sleep(50) }
  throw Error(`Page did not mount: ${page}`)
}
app.whenReady().then(async () => {
  app.dock?.hide()
  try {
    // Dynamic import ensures electron-store uses the isolated userData path.
    const theme = await import('../../apps/body/src/main/services/theme')
    theme.initializeTheme()
    for (const [group, methods] of Object.entries(defineHandlers)) for (const [method, config] of Object.entries(methods)) {
      const channel = `${group}-${method}`
      ipcMain.handle(channel, (_event, ...args) => {
        if (channel === 'theme-status') return { success: true, data: theme.status() }
        if (channel === 'theme-set') { try { return { success: true, data: theme.set(args[0]) } } catch (error) { return { success: false, msg: String(error) } } }
        if (channel === 'config-getConfigByKey') return { success: true, data: null }
        if (channel === 'startup-status') return { success: true, data: { revision: 0, state: 'done', message: '能力已装填', stages: [] } }
        if (channel === 'modelConfig-list') return { success: true, data: { defaultProfile: 'Demo', profiles: [
          { name: 'Demo', model: 'demo-chat', models: ['demo-chat', 'demo-reasoning'] },
          { name: 'Local', model: 'local-chat', models: ['local-chat'], baseUrl: 'http://127.0.0.1:11434' }
        ] } }
        if (channel === 'agent-listSessions') return { success: true, data: [] }
        // Business operations are disabled; this fixture checks visual state only.
        return { success: false, msg: `Theme fixture: ${channel} unavailable` }
      })
    }
    if (process.env.HUMAN_TEST_RESTORE === '1') {
      assert.equal(theme.status().id, 'paper-white')
      assert.equal(theme.status().fontScale, 1.125)
      const restored = await create('config', '.config-page')
      assert.equal(await restored.webContents.executeJavaScript('window.api.initialTheme.id'), 'paper-white')
      assert.equal((await read(restored, '.config-page')).fontSize, '18px')
      console.log('THEME_RESTART_PASS=' + JSON.stringify(theme.status()))
      app.exit(0)
      return
    }
    for (const [page, selector] of pages) await create(page, selector)
    for (const [id, scale] of [['dark', 1], ['light', 1.25], ['paper-white', 1.25], ['forest-night', 1], ['harbor', 1], ['dark', 1]] as const) {
      await windows[0].webContents.executeJavaScript(`(() => { const select = document.querySelector('.theme-settings select'); select.value = ${JSON.stringify(id)}; select.dispatchEvent(new Event('change', {bubbles:true})); })()`)
      await sleep(100)
      await windows[0].webContents.executeJavaScript(`(() => { const select = document.querySelectorAll('.theme-settings select')[1]; select.value = ${JSON.stringify(String(scale))}; select.dispatchEvent(new Event('change', {bubbles:true})); })()`)
      await sleep(350)
      const definition = themeDefinitions.themes[id], palette = definition.tokens
      const snapshots = await Promise.all(pages.map((page, index) => read(windows[index], page[1])))
      for (const [index, value] of snapshots.entries()) {
        assert.equal(value.theme, id, pages[index][0])
        assert.equal(value.scheme, definition.scheme, pages[index][0])
        assert.equal(value.fontSize, `${themeDefinitions.common['font-size-px'].base * scale}px`, pages[index][0])
        assert(value.fontFamily.includes('PingFang SC'), pages[index][0])
        if (['hello', 'pet'].includes(pages[index][0])) assert.equal(value.bodyBackground, 'rgba(0, 0, 0, 0)')
        else assert.equal(value.background, rgb(palette.bg), pages[index][0])
        if (pages[index][0] !== 'pet') assert.equal(value.color, rgb(palette.text), pages[index][0])
      }
      const infoButton = await windows[0].webContents.executeJavaScript(`(() => { const style = getComputedStyle(document.querySelector('.p-button-info')); return [style.backgroundColor, style.color]; })()`)
      assert.deepEqual(infoButton, [rgb(palette['info-soft']), rgb(palette.info)])
      writeFileSync(`/private/tmp/human-theme-${id}.png`, (await windows[1].webContents.capturePage()).toPNG())
      console.log('THEME_SYNC_PASS=' + JSON.stringify({ id, scale, pages: snapshots.length }))
    }
    const before = theme.status()
    assert.throws(() => theme.set({ id: 'invalid', fontScale: 1 }))
    assert.deepEqual(theme.status(), before)
    theme.set({ id: 'paper-white', fontScale: 1.125 })
    const late = await create('config', '.config-page')
    assert.equal((await read(late, '.config-page')).theme, 'paper-white')
    await late.webContents.reload()
    await sleep(400)
    assert.equal((await read(late, '.config-page')).fontSize, '18px')
    console.log('THEME_INHERIT_PASS=' + JSON.stringify(theme.status()))
    app.exit(0)
  } catch (error) { console.error(error); app.exit(1) }
})
