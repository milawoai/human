<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { IpcProxy } from '@renderer/plugin/ipc'
import { live2dPetAdapter } from '@renderer/adapters/live2dPetAdapter'
import {
  calculatePetWindowSizeForScale,
  calculateWheelScale,
  defaultPetWindowHeight,
  defaultPetWindowWidth
} from '@renderer/adapters/live2dResize'
import {
  createPointerDragTracker,
  createPointerTapTracker,
  formatTapMotionOutput,
  resolveHitAreaMotion
} from '@renderer/adapters/live2dTapMotion'
import type { Live2DPerformancePayload } from '@shared/live2dPerformance'
import { startSpeechPlayback } from '@shared/speech-playback'
import { getDefaultLive2DPetModel, live2dPetModels } from '@shared/live2dPetModels'

const ipc = inject<IpcProxy>('ipc')!
const passthrough = ref(false)
const countdown = ref(0)
const loadingText = ref('正在加载 Live2D...')
const loadError = ref('')
const menuVisible = ref(false)
const menuPosition = ref({ x: 0, y: 0 })
const activeSubmenu = ref<string | null>(null)
const isModelHovered = ref(false)
const tapOutputText = ref('')
const performanceText = ref('')
const showHearingButton = ref(false)
const ttsVisible = ref(false)
const ttsText = ref('你好，我是你的数字秘书。')
const ttsBusy = ref(false)
const ttsError = ref('')
const ttsInput = ref<HTMLTextAreaElement | null>(null)
let disposed = false
const petWindowClassName = 'pet-window'
let passthroughTimer: number | null = null
let live2dReadyPromise: Promise<void> | null = null
let removeLive2DCommandListener: (() => void) | null = null
let hoverPollingTimer: number | null = null
let resizeObserver: ResizeObserver | null = null
let resizeAnimationFrame: number | null = null
let tapOutputTimer: number | null = null
let performanceTextTimer: number | null = null
let hearingHoverTimer: number | null = null
let currentPerformanceAudio: HTMLAudioElement | null = null
let stopAudioLipSync: (() => void) | null = null
let currentModelScale = getDefaultLive2DPetModel().scale
let baseModelScale = getDefaultLive2DPetModel().scale
let autoIgnoreMouse = false
const tapTracker = createPointerTapTracker()
const dragTracker = createPointerDragTracker()

const getCanvas = () => document.getElementById('canvas') as HTMLCanvasElement | null

const startLive2D = async () => {
  if (live2dReadyPromise) return live2dReadyPromise

  live2dReadyPromise = startLive2DInternal()
  return live2dReadyPromise
}

const startLive2DInternal = async () => {
  try {
    await nextTick()
    const settingsResult = await ipc.config.getPetSettings()
    const selectedModelId = settingsResult.success ? settingsResult.data?.selectedModelId : ''
    const selectedModel =
      live2dPetModels.find((model) => model.id === selectedModelId) || getDefaultLive2DPetModel()
    currentModelScale = selectedModel.scale
    baseModelScale = selectedModel.scale

    resizeCanvasToStage()
    await live2dPetAdapter.start(selectedModel)
    loadingText.value = ''
    resizeCanvasToStage()
    startHoverPolling()
  } catch (error) {
    console.error(error)
    loadError.value = error instanceof Error ? error.message : String(error)
    live2dReadyPromise = null
  }
}

const setAutoIgnoreMouse = async (ignore: boolean) => {
  if (passthrough.value || autoIgnoreMouse === ignore) return

  autoIgnoreMouse = ignore
  await ipc.window.setPetIgnoreMouseEvents(ignore)
}

const updateHoverState = async (clientX: number, clientY: number, isInside = true) => {
  const canvas = getCanvas()
  const shouldReceiveMouse =
    isInside &&
    (menuVisible.value ||
      ttsVisible.value ||
      Boolean(document.elementFromPoint(clientX, clientY)?.closest('[data-pet-interactive]')) ||
      Boolean(canvas && live2dPetAdapter.hitTest(clientX, clientY, canvas).isHit))

  const wasHovered = isModelHovered.value
  isModelHovered.value = shouldReceiveMouse
  await setAutoIgnoreMouse(!shouldReceiveMouse)

  // hover 2s 浮现「听我说话」按钮
  if (shouldReceiveMouse && !wasHovered) {
    // 刚 hover 上去，启动 2s 定时器
    clearHearingHoverTimer()
    hearingHoverTimer = window.setTimeout(() => {
      hearingHoverTimer = null
      if (isModelHovered.value && !menuVisible.value && !ttsVisible.value) {
        showHearingButton.value = true
      }
    }, 2000)
  } else if (!shouldReceiveMouse) {
    // 鼠标离开，隐藏按钮 + 清除定时器
    clearHearingHoverTimer()
    showHearingButton.value = false
  }
}

const clearHearingHoverTimer = () => {
  if (hearingHoverTimer !== null) {
    window.clearTimeout(hearingHoverTimer)
    hearingHoverTimer = null
  }
}

const startHoverPolling = () => {
  if (hoverPollingTimer) return

  hoverPollingTimer = window.setInterval(async () => {
    if (passthrough.value) return

    const result = await ipc.window.getPetCursorPosition()
    if (!result.success || !result.data) return

    await updateHoverState(result.data.x, result.data.y, result.data.isInside)
  }, 120)
}

const resizeCanvasToStage = () => {
  const canvas = getCanvas()
  if (!canvas) return

  const width = window.innerWidth
  const height = window.innerHeight
  live2dPetAdapter.resizeCanvas(canvas, width, height)
}

const scheduleResizeCanvas = () => {
  if (resizeAnimationFrame !== null) {
    window.cancelAnimationFrame(resizeAnimationFrame)
  }

  resizeAnimationFrame = window.requestAnimationFrame(() => {
    resizeAnimationFrame = null
    resizeCanvasToStage()
  })
}

const startResizeObserver = () => {
  const canvas = getCanvas()
  if (!canvas || resizeObserver) return

  resizeObserver = new ResizeObserver(() => {
    scheduleResizeCanvas()
  })
  resizeObserver.observe(canvas)
  window.addEventListener('resize', scheduleResizeCanvas)
  scheduleResizeCanvas()
}

const stopResizeObserver = () => {
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', scheduleResizeCanvas)

  if (resizeAnimationFrame !== null) {
    window.cancelAnimationFrame(resizeAnimationFrame)
    resizeAnimationFrame = null
  }
}

const closePetWindow = async () => {
  menuVisible.value = false
  await ipc.window.closePetWindow()
}

const openContextMenu = (event: MouseEvent) => {
  event.preventDefault()
  setAutoIgnoreMouse(false)
  showHearingButton.value = false
  clearHearingHoverTimer()
  menuPosition.value = {
    x: Math.min(event.clientX, window.innerWidth - 124),
    y: Math.min(event.clientY, window.innerHeight - 86)
  }
  menuVisible.value = true
}

const closeContextMenu = () => {
  menuVisible.value = false
  activeSubmenu.value = null
}

const handlePointerMove = (event: PointerEvent) => {
  const dragDelta = dragTracker.move(event)
  if (dragDelta) {
    tapTracker.cancel()
    ipc.window.movePetWindowBy(dragDelta.deltaX, dragDelta.deltaY)
    return
  }

  updateHoverState(event.clientX, event.clientY)
}

const handlePointerDown = (event: PointerEvent) => {
  if (passthrough.value || menuVisible.value || ttsVisible.value) {
    tapTracker.cancel()
    dragTracker.cancel()
    return
  }

  const canvas = getCanvas()
  const isHitModel = Boolean(
    canvas && live2dPetAdapter.hitTest(event.clientX, event.clientY, canvas).isHit
  )
  if (!isHitModel) {
    tapTracker.cancel()
    dragTracker.cancel()
    return
  }

  tapTracker.start(event)
  dragTracker.start(event)
}

const handlePointerUp = (event: PointerEvent) => {
  const didDrag = dragTracker.finish(event)
  if (didDrag) {
    tapTracker.cancel()
    return
  }

  if (!tapTracker.finish(event)) return

  const canvas = getCanvas()
  if (!canvas) return

  const hitResult = live2dPetAdapter.hitTest(event.clientX, event.clientY, canvas)
  if (!hitResult.isHit) return

  const motionTarget = resolveHitAreaMotion(
    hitResult.hitAreaName ?? 'Default',
    live2dPetAdapter.getCurrentModelInfo()
  )
  if (!motionTarget) return

  live2dPetAdapter.playMotion(motionTarget.group, motionTarget.index)
  showTapOutput(formatTapMotionOutput(hitResult.hitAreaName ?? 'Default', motionTarget))
}

const handlePointerCancel = () => {
  tapTracker.cancel()
  dragTracker.cancel()
}

const handleWheel = (event: WheelEvent) => {
  if (passthrough.value || menuVisible.value || ttsVisible.value) return

  event.preventDefault()
  currentModelScale = calculateWheelScale(currentModelScale, event.deltaY)
  const windowSize = calculatePetWindowSizeForScale({
    baseWidth: defaultPetWindowWidth,
    baseHeight: defaultPetWindowHeight,
    baseScale: baseModelScale,
    targetScale: currentModelScale
  })
  ipc.window.resizePetWindow(windowSize.width, windowSize.height)
  const scaled = live2dPetAdapter.setModelScale(currentModelScale)

  if (scaled) {
    showTapOutput(`Live2D scale: ${currentModelScale.toFixed(2)}`)
  }
}

const showTapOutput = (message: string) => {
  console.info(message)
  tapOutputText.value = message

  if (tapOutputTimer) {
    window.clearTimeout(tapOutputTimer)
  }

  tapOutputTimer = window.setTimeout(() => {
    tapOutputText.value = ''
    tapOutputTimer = null
  }, 1400)
}

const showPerformanceText = (message: string) => {
  performanceText.value = message

  if (performanceTextTimer) {
    window.clearTimeout(performanceTextTimer)
  }

  performanceTextTimer = window.setTimeout(() => {
    performanceText.value = ''
    performanceTextTimer = null
  }, 5000)
}

const guessAudioMimeType = (url: string): string => {
  const lower = url.toLowerCase()
  if (lower.endsWith('.wav') || lower.endsWith('.wave')) return 'audio/wav'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.ogg')) return 'audio/ogg'
  if (lower.endsWith('.m4a')) return 'audio/mp4'
  return 'application/octet-stream'
}

const resolveAudioUrlForRenderer = async (
  audioUrl: string
): Promise<{ url: string; revoke?: () => void }> => {
  // If this looks like an absolute local file path (macOS/Linux), try IPC read -> blob URL.
  // If it fails, fall back to the original string (e.g. "/audio/test.wav", "https://...").
  if (audioUrl.startsWith('/')) {
    const result = await ipc.file.readFileAsArrayBuffer(audioUrl)
    if (result?.success && result.data) {
      let bytes: Uint8Array | null = null

      if (result.data instanceof ArrayBuffer) {
        bytes = new Uint8Array(result.data)
      } else if (result.data instanceof Uint8Array) {
        bytes = result.data
      } else if (
        typeof result.data === 'object' &&
        result.data &&
        'type' in result.data &&
        (result.data as any).type === 'Buffer'
      ) {
        // JSON-serialized Buffer fallback: { type: 'Buffer', data: number[] }
        const dataArray = (result.data as any).data
        if (Array.isArray(dataArray)) {
          bytes = new Uint8Array(dataArray)
        }
      }

      if (!bytes) {
        console.debug('[Pet] Unsupported audio bytes payload from IPC:', result.data)
        return { url: audioUrl }
      }

      const mime = guessAudioMimeType(audioUrl)
      const copy = new Uint8Array(bytes.byteLength)
      copy.set(bytes)
      const blobUrl = URL.createObjectURL(new Blob([copy.buffer], { type: mime }))
      return { url: blobUrl, revoke: () => URL.revokeObjectURL(blobUrl) }
    }
  }

  return { url: audioUrl }
}

const stopAudioLipSyncDriver = () => {
  stopAudioLipSync?.()
  stopAudioLipSync = null
  live2dPetAdapter.setExternalLipSyncRms(null)
}

const startAudioLipSyncDriver = async (audio: HTMLAudioElement) => {
  stopAudioLipSyncDriver()

  if (!audio) return

  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext
  if (!AudioContextCtor) return

  try {
    const audioContext: AudioContext = new AudioContextCtor()
    const source = audioContext.createMediaElementSource(audio)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 1024

    source.connect(analyser)
    analyser.connect(audioContext.destination)

    const data = new Uint8Array(analyser.fftSize)
    let raf: number | null = null

    const tick = () => {
      analyser.getByteTimeDomainData(data)

      let sumSquares = 0
      for (let i = 0; i < data.length; i += 1) {
        const v = (data[i] - 128) / 128
        sumSquares += v * v
      }
      const rms = Math.sqrt(sumSquares / data.length)
      live2dPetAdapter.setExternalLipSyncRms(rms)

      raf = window.requestAnimationFrame(tick)
    }

    raf = window.requestAnimationFrame(tick)

    stopAudioLipSync = () => {
      if (raf !== null) {
        window.cancelAnimationFrame(raf)
        raf = null
      }

      try {
        source.disconnect()
      } catch {}
      try {
        analyser.disconnect()
      } catch {}

      live2dPetAdapter.setExternalLipSyncRms(null)
      audioContext.close().catch(() => {})
    }

    // Best-effort; audio can still play even if resume fails.
    audioContext.resume().catch(() => {})
  } catch (error) {
    console.debug('[Pet] startAudioLipSyncDriver failed:', error)
    stopAudioLipSync = null
    live2dPetAdapter.setExternalLipSyncRms(null)
  }
}

const playPerformanceAudio = async (audioUrl: string, speechPlayback?: Live2DPerformancePayload['speechPlayback']) => {
  currentPerformanceAudio?.pause()
  stopAudioLipSyncDriver()
  const resolved = await resolveAudioUrlForRenderer(audioUrl)
  const audio = new Audio()
  currentPerformanceAudio = audio
  // The TTS cache is served by the backend on a different origin. WebAudio
  // requires CORS mode to analyse the audio for lip sync without silencing it.
  if (/^https?:/i.test(resolved.url)) audio.crossOrigin = 'anonymous'
  audio.src = resolved.url
  await startAudioLipSyncDriver(audio)
  audio.addEventListener(
    'ended',
    () => {
      stopAudioLipSyncDriver()
      resolved.revoke?.()
    },
    { once: true }
  )
  audio.addEventListener(
    'error',
    () => {
      stopAudioLipSyncDriver()
      resolved.revoke?.()
    },
    { once: true }
  )

  try {
    const started = await startSpeechPlayback(speechPlayback,
      async ticket => (await ipc.live2d.isSpeechPlaybackCurrent(ticket))?.data?.current === true,
      () => audio.play())
    if (!started) throw new Error('播报请求已过期')
  } catch (error) {
    if (currentPerformanceAudio === audio) stopAudioLipSyncDriver()
    resolved.revoke?.()
    throw error
  }
}

const performLive2D = async (payload: Live2DPerformancePayload) => {
  await startLive2D()
  if (payload.speechPlayback && (await ipc.live2d.isSpeechPlaybackCurrent(payload.speechPlayback))?.data?.current !== true) {
    return { textShown: false, motionPlayed: false, expressionPlayed: false, audioPlayed: false, audioError: '播报请求已过期' }
  }

  const result: {
    textShown: boolean
    motionPlayed: boolean
    expressionPlayed: boolean
    audioPlayed: boolean
    audioError?: string
  } = {
    textShown: false,
    motionPlayed: false,
    expressionPlayed: false,
    audioPlayed: false
  }

  if (payload.text) {
    showPerformanceText(payload.text)
    result.textShown = true
  }

  if (payload.expression) {
    result.expressionPlayed = live2dPetAdapter.setExpression(payload.expression)
  }

  if (payload.motion) {
    result.motionPlayed = live2dPetAdapter.playMotion(
      payload.motion.group,
      payload.motion.index ?? 0
    )
  }

  if (payload.audioUrl) {
    try {
      await playPerformanceAudio(payload.audioUrl, payload.speechPlayback)
      result.audioPlayed = true
    } catch (error) {
      result.audioError = error instanceof Error ? error.message : String(error)
    }
  }

  return result
}

const playRandomMotion = () => {
  const played = live2dPetAdapter.playRandomMotion()
  menuVisible.value = false

  if (!played) {
    loadError.value = '当前模型没有可播放动作'
  }
}

const playRandomExpression = () => {
  const played = live2dPetAdapter.playRandomExpression()
  menuVisible.value = false

  if (!played) {
    loadError.value = '当前模型没有可用表情'
  }
}

const togglePassthrough = async () => {
  if (passthrough.value) return

  menuVisible.value = false
  passthrough.value = true
  countdown.value = 3
  await ipc.window.setPetIgnoreMouseEvents(true)

  passthroughTimer = window.setInterval(async () => {
    countdown.value -= 1

    if (countdown.value <= 0) {
      if (passthroughTimer) {
        window.clearInterval(passthroughTimer)
        passthroughTimer = null
      }
      passthrough.value = false
      autoIgnoreMouse = false
      await ipc.window.setPetIgnoreMouseEvents(false)
    }
  }, 1000)
}

const passthroughLabel = computed(() =>
  passthrough.value ? `穿透中 ${countdown.value}s` : '临时穿透'
)

const toggleSubmenu = (name: string) => {
  activeSubmenu.value = activeSubmenu.value === name ? null : name
}

const onHearingButtonClick = async () => {
  showHearingButton.value = false
  console.log('[Pet] 听我说话 button clicked')
  await ipc.sense.openHearingPanel()
}

const onChatButtonClick = async () => {
  showHearingButton.value = false
  console.log('[Pet] AI 会话 button clicked')
  await ipc.sense.openChatPanel()
}

const openTtsDialog = async () => {
  closeContextMenu()
  showHearingButton.value = false
  clearHearingHoverTimer()
  tapTracker.cancel()
  dragTracker.cancel()
  ttsError.value = ''
  ttsVisible.value = true
  await setAutoIgnoreMouse(false)
  await nextTick()
  ttsInput.value?.focus()
}

const closeTtsDialog = () => {
  if (!ttsBusy.value) ttsVisible.value = false
}

const submitTts = async () => {
  if (ttsBusy.value) return
  const text = ttsText.value.trim()
  if (!text) {
    ttsError.value = '请输入要播放的文本'
    return
  }
  ttsBusy.value = true
  ttsError.value = ''
  try {
    const result = await ipc.live2d.synthesizeTts({ text })
    if (disposed) return
    if (!result.success || !result.data?.audioUrl) {
      throw new Error(result.msg || '语音合成失败，请稍后重试')
    }
    await playPerformanceAudio(result.data.audioUrl)
    if (disposed) return
    showPerformanceText(text)
    ttsVisible.value = false
  } catch (error) {
    if (!disposed) ttsError.value = error instanceof Error ? error.message : '语音播放失败'
  } finally {
    ttsBusy.value = false
  }
}

const setupLive2DCommandListener = () => {
  removeLive2DCommandListener = window.electron.ipcRenderer.on(
    'live2d-pet-command',
    async (_event, payload) => {
      const { requestId, command, params } = payload || {}

      try {
        await startLive2D()

        let data: unknown = null
        if (command === 'get-current') {
          data = live2dPetAdapter.getCurrentModelInfo()
        } else if (command === 'play-motion') {
          data = {
            played: live2dPetAdapter.playMotion(params?.group || '', Number(params?.index ?? 0))
          }
        } else if (command === 'set-expression') {
          data = {
            played: live2dPetAdapter.setExpression(params?.name || '')
          }
        } else if (command === 'perform') {
          data = await performLive2D(params as Live2DPerformancePayload)
        } else {
          throw new Error(`未知 Live2D 命令: ${command}`)
        }

        window.electron.ipcRenderer.send(`live2d-pet-command-response:${requestId}`, {
          success: true,
          data
        })
      } catch (error) {
        window.electron.ipcRenderer.send(`live2d-pet-command-response:${requestId}`, {
          success: false,
          msg: error instanceof Error ? error.message : String(error)
        })
      }
    }
  )
}

onUnmounted(() => {
  disposed = true
  document.documentElement.classList.remove(petWindowClassName)

  removeLive2DCommandListener?.()
  removeLive2DCommandListener = null

  if (passthroughTimer) {
    window.clearInterval(passthroughTimer)
    passthroughTimer = null
  }
  if (hoverPollingTimer) {
    window.clearInterval(hoverPollingTimer)
    hoverPollingTimer = null
  }
  stopResizeObserver()
  if (tapOutputTimer) {
    window.clearTimeout(tapOutputTimer)
    tapOutputTimer = null
  }
  if (performanceTextTimer) {
    window.clearTimeout(performanceTextTimer)
    performanceTextTimer = null
  }
  clearHearingHoverTimer()
  currentPerformanceAudio?.pause()
  currentPerformanceAudio = null
  stopAudioLipSyncDriver()
  ipc.window.setPetIgnoreMouseEvents(false)
  live2dPetAdapter.release()
})

onMounted(() => {
  document.documentElement.classList.add(petWindowClassName)
  setupLive2DCommandListener()
  startResizeObserver()
  startLive2D()
})
</script>

<template>
  <main
    class="pet-stage"
    @pointermove="handlePointerMove"
    @pointerdown="handlePointerDown"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerCancel"
    @wheel="handleWheel"
    @contextmenu="openContextMenu"
    @click="closeContextMenu"
  >
    <canvas id="canvas" class="live2d-canvas" />

    <button
      class="pet-tts-launcher pet-agent-launcher"
      type="button"
      data-pet-interactive
      :disabled="passthrough"
      @pointerdown.stop
      @pointerup.stop
      @click.stop="ipc.agent.openPanel()"
    >Agent 测试</button>

    <button
      class="pet-tts-launcher"
      type="button"
      data-pet-interactive
      :disabled="passthrough || ttsBusy"
      @pointerdown.stop
      @pointerup.stop
      @click.stop="openTtsDialog"
    >
      <i class="pi pi-volume-up" aria-hidden="true" />
      语音测试
    </button>

    <section
      v-if="ttsVisible"
      class="pet-tts-overlay"
      data-pet-interactive
      @pointerdown.stop
      @pointerup.stop
      @click.stop
      @wheel.stop
      @contextmenu.stop.prevent
      @keydown.esc.stop="closeTtsDialog"
    >
      <form
        class="pet-tts-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tts-title"
        @submit.prevent="submitTts"
      >
        <h2 id="tts-title">语音测试</h2>
        <label for="tts-text">想让我说什么？</label>
        <textarea
          id="tts-text"
          ref="ttsInput"
          v-model="ttsText"
          rows="4"
          maxlength="2000"
          placeholder="输入要播放的文本"
          :disabled="ttsBusy"
          @keydown.ctrl.enter.prevent="submitTts"
          @keydown.meta.enter.prevent="submitTts"
        />
        <p class="pet-tts-hint" role="status" aria-live="polite">
          {{ ttsBusy ? '正在生成语音，首次使用请稍等片刻…' : '使用当前语音插件的默认音色' }}
        </p>
        <p v-if="ttsError" class="pet-tts-error" role="alert">{{ ttsError }}</p>
        <div class="pet-tts-buttons">
          <button type="button" :disabled="ttsBusy" @click="closeTtsDialog">取消</button>
          <button type="submit" class="pet-tts-confirm" :disabled="ttsBusy || !ttsText.trim()">
            {{ ttsBusy ? '生成中…' : '确定并播放' }}
          </button>
        </div>
      </form>
    </section>

    <section v-if="showHearingButton" class="pet-float-actions" data-pet-interactive @click.stop>
      <button class="pet-float-action" type="button" @click="onHearingButtonClick">
        <i class="pi pi-microphone" />
        <span>听我说话</span>
      </button>
      <button class="pet-float-action" type="button" @click="onChatButtonClick">
        <i class="pi pi-comments" />
        <span>AI 会话</span>
      </button>
    </section>

    <section
      v-if="loadingText || loadError || passthrough || performanceText || tapOutputText"
      class="pet-status-badge"
    >
      <strong v-if="passthrough">穿透中 {{ countdown }}s</strong>
      <small v-else-if="performanceText">{{ performanceText }}</small>
      <small v-else-if="tapOutputText">{{ tapOutputText }}</small>
      <small v-else-if="loadingText">{{ loadingText }}</small>
      <small v-else class="error-text">{{ loadError }}</small>
    </section>

    <section
      v-if="menuVisible"
      class="pet-context-menu"
      data-pet-interactive
      :style="{ left: `${menuPosition.x}px`, top: `${menuPosition.y}px` }"
      @click.stop
      @contextmenu.prevent
    >
      <!-- Tools 子菜单 -->
      <div class="menu-item-with-submenu">
        <Button
          size="small"
          severity="info"
          class="menu-item-trigger"
          @click="toggleSubmenu('tools')"
        >
          Tools
          <span class="submenu-arrow">{{ activeSubmenu === 'tools' ? '◂' : '▸' }}</span>
        </Button>
        <div v-if="activeSubmenu === 'tools'" class="submenu">
          <Button size="small" severity="info" @click="playRandomMotion">随机动作</Button>
          <Button size="small" severity="info" @click="playRandomExpression">随机表情</Button>
          <Button
            size="small"
            severity="secondary"
            :disabled="passthrough"
            @click="togglePassthrough"
          >
            {{ passthroughLabel }}
          </Button>
        </div>
      </div>

      <!-- Sense 子菜单 -->
      <div class="menu-item-with-submenu">
        <Button
          size="small"
          severity="info"
          class="menu-item-trigger"
          @click="toggleSubmenu('sense')"
        >
          Sense
          <span class="submenu-arrow">{{ activeSubmenu === 'sense' ? '◂' : '▸' }}</span>
        </Button>
        <div v-if="activeSubmenu === 'sense'" class="submenu">
          <Button size="small" severity="success" @click="onHearingButtonClick">开启监听</Button>
          <Button size="small" severity="info" @click="onChatButtonClick">AI 会话</Button>
        </div>
      </div>

      <Button size="small" severity="danger" @click="closePetWindow">关闭</Button>
    </section>
  </main>
</template>

<style scoped>
.pet-tts-launcher {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border:1px solid var(--human-border);
  border-radius: var(--human-radius-lg);
  background:var(--human-input);
  color:var(--human-text);
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.pet-agent-launcher {
  top: 52px;
}

.pet-tts-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  padding: 12px;
  background:var(--human-scrim);
  -webkit-app-region: no-drag;
}

.pet-tts-dialog {
  box-sizing: border-box;
  width: 100%;
  max-width: 360px;
  max-height: calc(100vh - 24px);
  overflow: auto;
  padding: 16px;
  border:1px solid var(--human-border);
  border-radius: var(--human-radius-lg);
  background:var(--human-input);
  color:var(--human-text);
  box-shadow:var(--human-shadow);
}

.pet-tts-dialog h2 {
  margin: 0 0 12px;
  font-size:var(--human-text-lg);
}
.pet-tts-dialog label {
  display: block;
  margin-bottom: 8px;
  font-size:var(--human-text-base);
}
.pet-tts-dialog textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 10px;
  resize: vertical;
  border:1px solid var(--human-border);
  border-radius: var(--human-radius-md);
  background:var(--human-surface-raised);
  color:var(--human-text);
  font: inherit;
  font-size:var(--human-text-base);
  user-select: text;
}
.pet-tts-dialog textarea:focus-visible {
  outline:2px solid var(--human-accent);
}
.pet-tts-hint {
  margin: 10px 0;
  color:var(--human-text-muted);
  font-size:var(--human-text-sm);
}
.pet-tts-error {
  color:var(--human-danger);
  font-size:var(--human-text-base);
  overflow-wrap: anywhere;
}
.pet-tts-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.pet-tts-buttons button {
  padding: 8px 12px;
  border:1px solid var(--human-border);
  border-radius: var(--human-radius-md);
  background: transparent;
  color:var(--human-text);
  cursor: pointer;
}
.pet-tts-buttons .pet-tts-confirm {
  background:var(--human-accent-strong);
}
.pet-tts-buttons button:disabled,
.pet-tts-launcher:disabled {
  opacity: 0.55;
  cursor: default;
}

.pet-stage {
  width: 100vw;
  height: 100vh;
  margin: 0;
  position: relative;
  background: transparent;
  user-select: none;
  overflow: hidden;
  -webkit-app-region: no-drag;
}

:global(html.pet-window),
:global(html.pet-window body),
:global(html.pet-window #app) {
  background: transparent !important;
}

.live2d-canvas {
  width: 100%;
  height: 100%;
  display: block;
  background: transparent;
  -webkit-app-region: no-drag;
  cursor: pointer;
}

.pet-status-badge {
  position: absolute;
  bottom: 12px;
  left: 50%;
  z-index: 2;
  max-width: min(320px, calc(100vw - 24px));
  padding: 6px 10px;
  display: flex;
  transform: translateX(-50%);
  border:1px solid var(--human-border);
  border-radius: var(--human-radius-md);
  background:var(--human-input);
  color:var(--human-text);
  box-shadow:var(--human-shadow);
  backdrop-filter: blur(10px);
  -webkit-app-region: no-drag;
}

.pet-status-badge small,
.pet-status-badge strong {
  color:var(--human-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size:var(--human-text-sm);
  line-height: 18px;
}

.pet-status-badge .error-text {
  color:var(--human-danger);
}

.pet-context-menu {
  position: absolute;
  z-index: 4;
  width: 128px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border:1px solid var(--human-border);
  border-radius: var(--human-radius-md);
  background:var(--human-input);
  box-shadow:var(--human-shadow);
  backdrop-filter: blur(10px);
  -webkit-app-region: no-drag;
}

.pet-context-menu * {
  -webkit-app-region: no-drag;
}

.menu-item-with-submenu {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.menu-item-trigger {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  width: 100%;
}

.submenu-arrow {
  font-size:var(--human-text-xs);
  opacity: 0.6;
}

.submenu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0 0 8px;
  border-left:2px solid var(--human-border);
  margin-left: 8px;
}

.pet-float-actions {
  position: absolute;
  top: 50%;
  left: 50%;
    transform: translate(-50%, -50%);
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: min(260px, calc(100vw - 24px));
  -webkit-app-region: no-drag;
  animation: fadeInUp 0.3s ease-out;
}

.pet-float-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 104px;
  height: 36px;
  padding: 0 12px;
  border:1px solid var(--human-border);
  border-radius: var(--human-radius-lg);
  background:var(--human-input);
  color:var(--human-text);
  font-size:var(--human-text-base);
  line-height: 1;
  box-shadow:var(--human-shadow);
  backdrop-filter: blur(12px);
  cursor: pointer;
  transition:background 0.2s,
    transform 0.2s;
}

.pet-float-action:hover {
  background:var(--human-accent-soft);
  transform: scale(1.05);
}

.pet-float-action i {
  font-size:var(--human-text-base);
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translate(-50%, -40%);
}
  to {
    opacity: 1;
    transform: translate(-50%, -50%);
}
}
</style>
