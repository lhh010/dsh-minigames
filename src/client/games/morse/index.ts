/**
 * 摩斯电码游戏接线：把纯逻辑挂进 MiniGameInstance——解码轮由调度器按
 * dt 推进播放进度并点亮指示灯，编码轮以 keydown 起表、keyup 判时长；
 * dirty 渲染（亮灯/按压/倒计时才重绘），暂停经调度器停走天然冻结。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  LETTER_END_GAP_MS, LEVELS, createMorseState, endPlayback, finishEncodeLetter,
  mulberry32, pickLetter, pushElement, signalAt, startRound, totalDurationMs,
  type MorseState,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, letterAt, radioAt, renderMorse } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** 新一轮自动开局的等待时长（ms）。 */
const READY_WAIT_MS = 900
/** 答题反馈闪烁时长（ms）。 */
const FLASH_MS = 280

function createMorseGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: morse needs a 2d canvas context')
  const ctx = fit.ctx

  const seed = Math.floor(Math.random() * 2 ** 31)
  let state: MorseState = createMorseState(mulberry32(seed))
  let running = false
  let hintVisible = (LEVELS[0]?.hintDefault ?? true)

  // 播放/作答进度（暂停时由调度器停走自动冻结）。
  let playbackMs = 0
  let roundElapsedMs = 0
  let readyWaitMs = 0
  let replaying = false
  // 电键按压状态。
  let pressing = false
  let pressStartAt = 0
  let lastReleaseAt = 0
  // 渲染反馈。
  let lampOn = false
  let flashKind: 'none' | 'good' | 'bad' = 'none'
  let flashUntil = 0
  let lastScore = -1

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  const flash = (kind: 'good' | 'bad'): void => {
    flashKind = kind
    flashUntil = performance.now() + FLASH_MS
  }

  /** 开新一轮（ready 状态等到点后调用）。 */
  const beginRound = (): void => {
    startRound(state)
    playbackMs = 0
    roundElapsedMs = 0
    readyWaitMs = 0
    replaying = false
    loop.markDirty()
  }

  const handlePick = (ch: string): void => {
    const result = pickLetter(state, ch, roundElapsedMs)
    if (result === 'ignored') return
    if (result === 'round-clear') flash('good')
    else if (result === 'wrong') flash('bad')
    // 答错清零重来：重播一遍电码。
    if (result === 'wrong' && state.phase === 'answer') {
      playbackMs = 0
      replaying = true
    }
    reportScore()
    loop.markDirty()
  }

  const beginPress = (): void => {
    if (!running || pressing) return
    if (state.phase === 'encode') {
      pressing = true
      pressStartAt = performance.now()
      loop.markDirty()
    } else if (state.phase === 'answer' && !replaying) {
      // 解码作答阶段：空格/点击面板 = 重播电码。
      playbackMs = 0
      replaying = true
      loop.markDirty()
    }
  }

  const endPress = (): void => {
    if (!pressing) return
    pressing = false
    const dur = performance.now() - pressStartAt
    lastReleaseAt = performance.now()
    if (pushElement(state, dur)) loop.markDirty()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    if (state.mode === 'decode' && state.phase === 'answer') {
      const ch = letterAt(x, y, (LEVELS[state.level]?.alphabet ?? 'ETAIN'))
      if (ch !== null) {
        handlePick(ch)
        return
      }
    }
    if (radioAt(x, y)) beginPress()
  }

  const onMouseUp = (): void => {
    endPress()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      resetGame()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyH') {
      event.preventDefault()
      hintVisible = !hintVisible
      loop.markDirty()
    } else if (event.code === 'Space') {
      event.preventDefault()
      if (!event.repeat) beginPress()
    }
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') endPress()
  }

  const resetGame = (): void => {
    state = createMorseState(mulberry32(seed))
    hintVisible = LEVELS[0]?.hintDefault ?? true
    pressing = false
    replaying = false
    flashKind = 'none'
    lastScore = -1
    reportScore()
    beginRound()
  }

  const currentFlash = (): 'none' | 'good' | 'bad' => {
    return performance.now() < flashUntil ? flashKind : 'none'
  }

  const draw = (paused: boolean): void => {
    renderMorse(ctx, state, {
      paused,
      hintVisible,
      lampOn: lampOn || pressing,
      pressMs: pressing ? performance.now() - pressStartAt : null,
      flash: currentFlash(),
    })
  }

  const loop = createFrameLoop((frame) => {
    const dtMs = frame.dt * 1000
    if (running && state.phase === 'ready') {
      readyWaitMs += dtMs
      if (readyWaitMs >= READY_WAIT_MS) beginRound()
      else loop.markDirty()
    } else if (running && state.phase === 'playback') {
      roundElapsedMs += dtMs
      playbackMs += dtMs
      if (playbackMs >= totalDurationMs(state.schedule)) endPlayback(state)
      loop.markDirty()
    } else if (running && state.phase === 'answer' && replaying) {
      playbackMs += dtMs
      if (playbackMs >= totalDurationMs(state.schedule)) replaying = false
      loop.markDirty()
    } else if (running && state.phase === 'encode') {
      roundElapsedMs += dtMs
      if (!pressing && state.encodeBuffer.length > 0
        && performance.now() - lastReleaseAt >= LETTER_END_GAP_MS) {
        const result = finishEncodeLetter(state, roundElapsedMs)
        if (result === 'round-clear') flash('good')
        else if (result === 'wrong') flash('bad')
        reportScore()
      }
      if (pressing) loop.markDirty()
    }
    // 指示灯变化或反馈闪烁期间需要重绘。
    const lit = signalAt(state.schedule, playbackMs)
    if (lit !== lampOn) {
      lampOn = lit
      loop.markDirty()
    }
    if (currentFlash() !== 'none') loop.markDirty()
    if (frame.render) draw(false)
  }, { mode: 'dirty' })

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    endPress() // 按住电键时暂停：丢弃该次未完成的按压。
    loop.pause()
    draw(true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.resume()
    loop.markDirty()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  focusGameHost(host)
  running = true
  loop.start()
  loop.markDirty()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
  }
}

export const morseGame: MiniGameDefinition = {
  id: 'morse',
  title: '摩斯电码 Morse',
  icon: '📡',
  description: '长短按键打出电码——听声辨码、按键发报，学习最古老的数字语言。',
  controls: ['空格 / 点击电台：电键 · 解码时重播', '点击字母：作答', 'H：对照表', 'R：重开', 'P：暂停'],
  create: createMorseGame,
}
