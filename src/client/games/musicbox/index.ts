/**
 * 音乐盒游戏定义：把纯状态机（logic.ts）接成 {@link MiniGameInstance}。
 * 播放用 Web Audio 振荡器按 buildPlayback 的时间表发声（首击手势后初始化）；
 * 玩家从七根唱名条（点击或 1-7 键）逐音复现。空格重播（次数有限）、
 * H 提示（限 2 次）、Enter 推进/重开、R 同种子重开、P 暂停。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import {
  SOLFEGE, buildPlayback, createMusicBoxState, finishPlayback, inputNote, nextLevel,
  remainingNotes, startPlayback, useHint, type MusicBoxState, type PlaybackEvent,
} from './logic.ts'
import { LOGICAL_W, LOGICAL_H, barCenterX, renderMusicBox, solfegeHit, type MusicBoxView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, accent, createParticles } from '../theme.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

const BEST_KEY = 'dsh-minigames:best:musicbox'

function loadBest(): number {
  try {
    const v = Number(window.localStorage.getItem(BEST_KEY))
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
  } catch { return 0 }
}

function saveBest(v: number): void {
  try { window.localStorage.setItem(BEST_KEY, String(Math.floor(v))) } catch { /* storage unavailable */ }
}

/** C 大调七音级频率（do..si），音级下标直接查表。 */
const FREQS = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88] as const
/** 一次播放的驱动态：事件表 + 起始时刻。 */
interface PlayRun {
  events: PlaybackEvent[]
  totalMs: number
  startMs: number
  nextIdx: number
}

function createMusicBoxGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: musicbox needs a 2d canvas context')
  const ctx = fit.ctx

  let state: MusicBoxState = createMusicBoxState((Date.now() ^ 0x6d336b0f) >>> 0)
  let running = false
  let best = loadBest()
  let lastScore = -1
  let playRun: PlayRun | null = null
  let message: string | null = null
  /** 唱名闪烁计时（秒）：正数绿闪，负数红闪。 */
  const flashes: number[] = [0, 0, 0, 0, 0, 0, 0]
  const particles = createParticles()

  // --- 音频：Web Audio 振荡器合成，首个用户手势时初始化 ---
  let actx: AudioContext | null = null
  const initAudio = (): void => {
    if (actx !== null) { if (actx.state === 'suspended') void actx.resume(); return }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctor === undefined) return
      actx = new Ctor()
    } catch { actx = null }
  }
  /** 单音：三角波主振 + 正弦八度泛音，指数衰减收尾。 */
  const tone = (freq: number, durSec: number, vol: number): void => {
    if (actx === null) return
    try {
      const now = actx.currentTime
      const o = actx.createOscillator()
      const o2 = actx.createOscillator()
      const g = actx.createGain()
      const g2 = actx.createGain()
      o.type = 'triangle'
      o2.type = 'sine'
      o.frequency.value = freq
      o2.frequency.value = freq * 2
      g.gain.setValueAtTime(vol, now)
      g.gain.exponentialRampToValueAtTime(0.001, now + durSec)
      g2.gain.value = 0.25
      o.connect(g)
      o2.connect(g2)
      g2.connect(g)
      g.connect(actx.destination)
      o.start(now)
      o2.start(now)
      o.stop(now + durSec + 0.02)
      o2.stop(now + durSec + 0.02)
    } catch { /* audio unavailable */ }
  }
  const noteSound = (note: number, beats: number): void => {
    tone(FREQS[note] ?? 261.63, 0.22 * beats, 0.12)
  }
  const missSound = (): void => {
    tone(155.56, 0.35, 0.14)
    tone(116.54, 0.5, 0.1)
  }
  /** 过关上行琶音音高。 */
  const FANFARE = [523.25, 659.25, 783.99, 1046.5] as const
  const clearSound = (): void => {
    for (let i = 0; i < FANFARE.length; i += 1) {
      window.setTimeout(() => tone(FANFARE[i]!, 0.3, 0.1), i * 110)
    }
  }

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
    if (state.score > best) { best = state.score; saveBest(best) }
  }

  /** 开始一次旋律播放（空格 / 点击 / 关卡开场）。 */
  const beginPlayback = (): void => {
    if (!startPlayback(state)) {
      message = '播放次数已用完，凭记忆作答'
      loop.markDirty()
      return
    }
    message = null
    const events = buildPlayback(state.melody)
    const total = events.length === 0 ? 0 : events[events.length - 1]!.atMs + events[events.length - 1]!.durMs
    playRun = { events, totalMs: total, startMs: performance.now(), nextIdx: 0 }
    loop.markDirty()
  }

  const advance = (): void => {
    if (state.phase === 'level-clear') {
      nextLevel(state)
      beginPlayback()
    } else if (state.phase === 'game-over' || state.phase === 'complete') {
      state = createMusicBoxState((Date.now() ^ 0x1c0ffee) >>> 0)
      lastScore = -1
      reportScore()
      beginPlayback()
    }
  }

  const flash = (note: number, good: boolean): void => {
    flashes[note] = good ? 0.45 : -0.45
  }

  /** 处理一次唱名输入：反馈音、粒子、闪烁与结算推进。 */
  const submit = (note: number): void => {
    if (state.phase !== 'input') return
    noteSound(note, 1)
    const result = inputNote(state, note)
    flash(note, result !== 'miss' && result !== 'game-over')
    if (result === 'miss') missSound()
    if (result === 'level-clear') {
      clearSound()
      particles.burst(LOGICAL_W / 2, 120, THEME.gold, 26, 240)
      reportScore()
    } else if (result === 'game-over') {
      missSound()
      reportScore()
    } else if (result === 'correct' || result === 'slot-done') {
      particles.burst(barCenterX(note), 300, accent(note), 8, 150)
    }
    loop.markDirty()
  }

  const doHint = (): void => {
    const notes = useHint(state)
    if (notes === null) {
      message = state.hintsLeft <= 0 ? '提示已用完' : '现在不能提示'
    } else {
      message = '提示：' + notes.slice().reverse().map(n => SOLFEGE[n]).join(' ')
      for (const n of notes) noteSound(n, 1)
    }
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const digit = event.code.startsWith('Digit') ? Number(event.code.slice(5)) : -1
    if (digit >= 1 && digit <= 7) {
      event.preventDefault()
      if (!event.repeat) submit(digit - 1)
      return
    }
    switch (event.code) {
      case 'Enter': case 'NumpadEnter':
        event.preventDefault()
        if (!event.repeat) { initAudio(); advance() }
        break
      case 'Space':
        event.preventDefault()
        if (!event.repeat && (state.phase === 'listening' || state.phase === 'input')) {
          initAudio()
          if (playRun === null) beginPlayback()
        }
        break
      case 'KeyH':
        event.preventDefault()
        if (!event.repeat) doHint()
        break
      case 'KeyR':
        event.preventDefault()
        if (!event.repeat) {
          initAudio()
          const seed = state.seed
          state = createMusicBoxState(seed)
          lastScore = -1
          reportScore()
          beginPlayback()
        }
        break
      case 'KeyP': case 'Escape':
        event.preventDefault()
        if (!event.repeat) togglePauseLocal()
        break
    }
  }

  const onPointerDown = (event: PointerEvent): void => {
    initAudio()
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    if (state.phase === 'level-clear' || state.phase === 'game-over' || state.phase === 'complete') {
      advance()
      return
    }
    if (pausedLocal) { togglePauseLocal(); return }
    const n = solfegeHit(x, y)
    if (n >= 0) submit(n)
    else if (playRun === null) beginPlayback()
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    // 闪烁衰减。
    let flashing = false
    for (let i = 0; i < flashes.length; i += 1) {
      const cur = flashes[i]!
      if (cur !== 0) {
        flashes[i] = cur > 0 ? Math.max(0, cur - f.dt) : Math.min(0, cur + f.dt)
        flashing = true
      }
    }
    // 播放驱动：按时间表触发音频，标记当前高亮拍。
    let playSlot: number | null = null
    if (playRun !== null) {
      const elapsed = performance.now() - playRun.startMs
      while (playRun.nextIdx < playRun.events.length && playRun.events[playRun.nextIdx]!.atMs <= elapsed) {
        const ev = playRun.events[playRun.nextIdx]!
        for (const n of ev.notes) noteSound(n, 1)
        playRun.nextIdx += 1
      }
      if (playRun.nextIdx > 0) playSlot = playRun.events[playRun.nextIdx - 1]!.slot
      if (elapsed > playRun.totalMs + 260) {
        playRun = null
        finishPlayback(state)
        message = null
        loop.markDirty()
      }
    }
    const animating = playRun !== null || particles.size() > 0 || flashing
    if (animating || f.render) {
      renderMusicBox(ctx, { state, paused: pausedLocal, best, playSlot, flashes, message })
      particles.tick(ctx, f.dt * 1000)
      if (animating) loop.markDirty()
    }
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })

  let pausedLocal = false
  const pause = (): void => {
    if (!running) return
    running = false
    pausedLocal = true
    playRun = null
    renderMusicBox(ctx, { state, paused: true, best, playSlot: null, flashes, message })
  }
  const resume = (): void => {
    if (running) return
    pausedLocal = false
    loop.markDirty()
    running = true
  }
  function togglePauseLocal(): void {
    if (pausedLocal) resume()
    else if (running) pause()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      if (actx !== null) { try { void actx.close() } catch { /* ignore */ } }
      fit.dispose()
    },
  }
}

export const musicboxGame: MiniGameDefinition = {
  id: 'musicbox',
  title: '音乐盒 MusicBox',
  icon: '🎼',
  description: '听旋律辨音符——耳朵的记忆力训练场。',
  controls: [
    '点击唱名条 / 1-7 键：按顺序复现旋律',
    '空格：重播旋律（次数有限） · H：提示（限 2 次）',
    'Enter：下一关/重开 · R：同种子重开 · P：暂停',
  ],
  create: createMusicBoxGame,
}
