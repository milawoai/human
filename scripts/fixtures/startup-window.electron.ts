import { writeFileSync } from 'node:fs'
import { app, ipcMain } from 'electron'
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { WindowManager } from '../../apps/body/src/main/windowManager'
import { startupProgress, status } from '../../apps/body/src/main/services/startup'
import { waitForStartupDisplay } from '../../apps/body/src/main/services/startup/display'
import { runStartupTasks } from '../../apps/body/src/main/services/startup/tasks'
app.setPath('userData', process.env.HUMAN_TEST_USER_DATA!)
const theme = { id: 'dark', fontScale: Number(process.env.HUMAN_TEST_FONT_SCALE || 1), revision: 0 }
ipcMain.on('theme-bootstrap', event => { event.returnValue = theme })
ipcMain.handle('theme-status', () => ({ success: true, data: theme }))
ipcMain.handle('startup-status', () => ({ success: true, data: status() }))
ipcMain.handle('backendLifecycle-openSettings', () => ({ success: true }))
ipcMain.handle('config-getConfigByKey', () => ({ success: true, data: null }))
app.whenReady().then(async () => {
  app.dock?.hide()
  const windows = WindowManager.getInstance()
  try {
    assert.equal(windows.createHelloWindow(theme.fontScale).success, true)
    const window = windows.getHelloWindow()!
    assert.equal(window.getBounds().width, Math.round(480 * theme.fontScale))
    assert.equal(window.getBounds().height, Math.round(320 * theme.fontScale))
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
    if (mode === 'long-progress') {
      const snapshot = status()
      snapshot.revision += 10
      snapshot.message = '能力装填中：正在读取工作区与初始化模型，'.repeat(12)
      snapshot.stages = Array.from({ length: 20 }, (_, index) => ({ ...snapshot.stages[0], id: `extra-${index}`, state: 'done', message: `第${index + 1}项初始化完成：工作区资源与本地模型已准备就绪` }))
      window.webContents.send('startup:state', snapshot)
      await sleep(100)
      const inspect = () => window.webContents.executeJavaScript(`(() => {
        const area = document.querySelector('.hello-progress'), footer = document.querySelector('footer');
        return { exists: !!area, scrollHeight: area?.scrollHeight, height: area?.clientHeight, top: area?.scrollTop,
          overflow: area && getComputedStyle(area).overflowY, footerBottom: footer.getBoundingClientRect().bottom,
          windowHeight: innerHeight };
      })()`)
      let metrics = await inspect()
      writeFileSync('/private/tmp/human-startup-long-progress.png', (await window.webContents.capturePage()).toPNG())
      assert(metrics.exists, 'Progress needs a bounded scroll area')
      assert(metrics.scrollHeight > metrics.height && metrics.height > 0, JSON.stringify(metrics))
      assert.equal(metrics.overflow, 'auto')
      assert(Math.abs(metrics.top + metrics.height - metrics.scrollHeight) <= 1, JSON.stringify(metrics))
      assert(metrics.footerBottom <= metrics.windowHeight)
      await window.webContents.executeJavaScript("document.querySelector('.hello-progress').scrollTop = 0")
      snapshot.revision++
      snapshot.message = '最后一项能力已装填：现在可以开始工作'
      window.webContents.send('startup:state', snapshot)
      await sleep(100)
      metrics = await inspect()
      assert(Math.abs(metrics.top + metrics.height - metrics.scrollHeight) <= 1, JSON.stringify(metrics))
      windows.resizeHelloWindow(1.5)
      await window.webContents.executeJavaScript("document.documentElement.style.setProperty('--human-root-size', '24px')")
      assert.equal(window.getBounds().width, 720)
      assert.equal(window.getBounds().height, 480)
      await sleep(100)
      metrics = await inspect()
      assert.equal(await window.webContents.executeJavaScript("getComputedStyle(document.documentElement).fontSize"), '24px')
      assert(Math.abs(metrics.top + metrics.height - metrics.scrollHeight) <= 1, JSON.stringify(metrics))
      console.log('STARTUP_SCROLL_PASS=' + JSON.stringify(metrics))
      windows.closeHelloWindow()
      assert(performance.now() - shownAt >= 1000)
      console.log('STARTUP_WINDOW_PASS=' + JSON.stringify({ mode }))
      app.quit()
      return
    }
    const dom = await window.webContents.executeJavaScript(`({ text: document.body.innerText,
      status: document.querySelector('[role="status"]')?.textContent,
      footerBelowTitle: document.querySelector('footer')?.getBoundingClientRect().top > document.querySelector('h1')?.getBoundingClientRect().bottom,
      footerInWindow: document.querySelector('footer')?.getBoundingClientRect().bottom <= innerHeight })`)
    // Snapshot query and event delivery must converge before checking the UI.
    for (let i = 0; i < 20 && dom.status !== status().message; i++) {
      await sleep(20)
      dom.status = await window.webContents.executeJavaScript(`document.querySelector('[role="status"]')?.textContent`)
    }
    const cardWidth = await window.webContents.executeJavaScript("document.querySelector('.hello-content').getBoundingClientRect().width")
    assert.equal(cardWidth, 360 * theme.fontScale)
    assert.equal(dom.status, status().message)
    assert.equal(dom.footerBelowTitle, true)
    assert.equal(dom.footerInWindow, true)
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
