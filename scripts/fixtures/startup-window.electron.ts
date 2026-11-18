import { app, ipcMain } from 'electron'
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { WindowManager } from '../../apps/body/src/main/windowManager'
import { startupProgress, status } from '../../apps/body/src/main/services/startup'
import { waitForStartupDisplay } from '../../apps/body/src/main/services/startup/display'
import { runStartupTasks } from '../../apps/body/src/main/services/startup/tasks'
app.setPath('userData', process.env.HUMAN_TEST_USER_DATA!)
ipcMain.handle('startup-status', () => ({ success: true, data: status() }))
ipcMain.handle('backendLifecycle-openSettings', () => ({ success: true }))
ipcMain.handle('config-getConfigByKey', () => ({ success: true, data: null }))
app.whenReady().then(async () => {
  app.dock?.hide()
  const windows = WindowManager.getInstance()
  try {
    assert.equal(windows.createHelloWindow().success, true)
    const window = windows.getHelloWindow()!
    let shownAt = 0
    window.once('show', () => { shownAt = performance.now() })
    const displayed = waitForStartupDisplay(window, new AbortController().signal)
    void displayed.catch(() => {})
    const mode = process.env.HUMAN_TEST_STARTUP_MODE
    await runStartupTasks(startupProgress, async () => {}, async ready => {
      if (mode === 'slow') {
        await sleep(1300)
        assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[role="status"]')?.textContent`), '大脑准备中')
      }
      ready(mode === 'failure' ? '业务初始化失败' : undefined)
      if (mode === 'slow') {
        await sleep(150)
        assert.equal(await window.webContents.executeJavaScript(`document.querySelector('[role="status"]')?.textContent`), '能力装填中')
      }
    })
    await displayed
    const dom = await window.webContents.executeJavaScript(`({ text: document.body.innerText,
      status: document.querySelector('[role="status"]')?.textContent,
      footerBelowTitle: document.querySelector('footer')?.getBoundingClientRect().top > document.querySelector('h1')?.getBoundingClientRect().bottom })`)
    // Snapshot query and event delivery must converge before checking the UI.
    for (let i = 0; i < 20 && dom.status !== status().message; i++) {
      await sleep(20)
      dom.status = await window.webContents.executeJavaScript(`document.querySelector('[role="status"]')?.textContent`)
    }
    assert.equal(dom.status, status().message)
    assert.equal(dom.footerBelowTitle, true)
    const backgrounds = await window.webContents.executeJavaScript(`['html', 'body', '#app'].map(selector => getComputedStyle(document.querySelector(selector)).backgroundColor)`)
    assert.deepEqual(backgrounds, ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)'])
    if (mode === 'failure') assert.equal(status().state, 'failed')
    else {
      assert(dom.text.includes('大脑已醒来'))
      assert(dom.text.includes('能力已装填'))
    }
    windows.closeHelloWindow()
    const visibleMs = performance.now() - shownAt
    assert(shownAt > 0 && visibleMs >= 1000)
    console.log('STARTUP_WINDOW_PASS=' + JSON.stringify({ mode, visibleMs: Math.round(visibleMs), message: dom.status }))
    app.quit()
  } catch (error) { console.error(error); app.exit(1) }
})
