/**
 * 天平称重 Scales 游戏定义：把纯逻辑接成 {@link MiniGameInstance}。交互
 * 为点硬币循环分配（台面→左盘→右盘→取下）、空格或按钮称量、Enter 进
 * 指认模式（点币 + 点轻/重按钮）、A 推理助手开关（教学向、计分减半）、
 * R 重开（新种子）、P 暂停。硬模式限时 180 秒。过关上报 onScore（关卡
 * ×100，用过助手减半）并自动进入下一关；关卡进度持久化。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import { accuse, createScalesState, expire, scoreFor, weigh, type ScalesState } from './logic.ts'
import {
  LOGICAL_H, LOGICAL_W, clearBtnAt, coinAt, createScalesView, heavyBtnAt, lightBtnAt,
  renderScales, tickScalesView, weighBtnAt,
} from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 2000
const TOAST_MS = 1400

function createScalesGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: scales needs a 2d canvas context')
  const ctx = fit.ctx

  let level = Math.min(readLevel('scales'), 5)
  let state = createScalesState(level, Math.floor(Math.random() * 0x7fffffff))
  let view = createScalesView()
  /** 左右盘分配（下标按放入顺序）。 */
  let leftPan: number[] = []
  let rightPan: number[] = []
  let accuseMode = false
  let accuseSel: number | null = null
  let assistantOn = state.params.assistant
  let assistantUsed = assistantOn
  let toast: string | null = null
  let toastUntil = 0
  let running = false
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let lastScore = -1
  /** 限时截止时刻（ms），0 表示未在计时。 */
  let deadlineAt = 0
  let deadlineRemaining = 0
  let shownSecond = -1
  const particles = createParticles()

  const markDirty = (): void => loop.markDirty()

  const showToast = (msg: string): void => {
    toast = msg
    toastUntil = performance.now() + TOAST_MS
    markDirty()
  }

  const startDeadline = (): void => {
    const limit = state.params.timeLimitSec
    deadlineAt = limit === null ? 0 : performance.now() + limit * 1000
    shownSecond = -1
  }

  const startLevel = (next: number): void => {
    level = Math.min(Math.max(next, 1), 5)
    state = createScalesState(level, Math.floor(Math.random() * 0x7fffffff))
    saveLevel('scales', level)
    view = createScalesView()
    leftPan = []
    rightPan = []
    accuseMode = false
    accuseSel = null
    assistantOn = state.params.assistant
    assistantUsed = assistantOn
    toast = null
    startDeadline()
    markDirty()
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      startLevel(level + 1)
    }, delayMs)
  }

  const reportScore = (): void => {
    const score = scoreFor(state.level, assistantUsed)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  /** 执行一次称量：合法则清盘、倾斜动画与粒子，历史自动记录。 */
  const doWeigh = (): void => {
    if (state.status !== 'playing') return
    if (state.history.length >= state.params.weighings) {
      showToast('称量已用完 · Enter 指认')
      return
    }
    if (leftPan.length === 0) {
      showToast('先放硬币上盘')
      return
    }
    if (leftPan.length !== rightPan.length) {
      showToast('两侧硬币数量要相等')
      return
    }
    const next = weigh(state, leftPan, rightPan)
    if (next === null) {
      showToast('无法称量')
      return
    }
    state = next
    if (assistantOn) assistantUsed = true
    const result = state.history[state.history.length - 1]!.result
    view.target = result === 'left' ? -0.13 : result === 'right' ? 0.13 : 0
    // 重盘一侧爆开粒子（平衡在支点上方冒一点金色）。
    if (result === 'left') particles.burst(360 - 132, 132 + 62, THEME.accents[0], 10, 110)
    else if (result === 'right') particles.burst(360 + 132, 132 + 62, THEME.accents[4], 10, 110)
    else particles.burst(360, 120, THEME.gold, 8, 90)
    leftPan = []
    rightPan = []
    if (state.history.length >= state.params.weighings) showToast('称量用完 · Enter 指认')
    markDirty()
  }

  /** 提交指认：正确过关上报并安排下一关，错误判负。 */
  const doAccuse = (coin: number, heavy: boolean): void => {
    if (state.status !== 'playing') return
    if (assistantOn) assistantUsed = true
    const next = accuse(state, coin, heavy)
    if (next === null) return
    state = next
    accuseMode = false
    accuseSel = null
    deadlineAt = 0
    if (next.status === 'won') {
      const c = coinCenterOf(coin)
      particles.burst(c.x, c.y, THEME.gold, 16, 150)
      particles.burst(c.x, c.y, THEME.accents[2], 10, 100)
      reportScore()
      if (running) scheduleAdvance(ADVANCE_MS)
      else advanceRemaining = ADVANCE_MS
    }
    markDirty()
  }

  /** 指认模式下被选中硬币的网格圆心（与 render.ts 布局一致）。 */
  const coinCenterOf = (i: number): { x: number; y: number } => {
    const col = i % 8
    const row = Math.floor(i / 8)
    return { x: 186 + col * 50, y: row === 0 ? 374 : 430 }
  }

  const toggleAssistant = (): void => {
    if (!state.params.assistant && !assistantOn) {
      showToast('本关禁用助手')
      return
    }
    assistantOn = !assistantOn
    if (assistantOn) assistantUsed = true
    markDirty()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || state.status !== 'playing') return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const coin = coinAt(state.params.coins, x, y)
    if (coin !== null) {
      if (accuseMode) {
        accuseSel = coin
      } else {
        // 循环分配：台面 → 左盘 → 右盘 → 台面。
        if (leftPan.includes(coin)) {
          leftPan = leftPan.filter(c => c !== coin)
          rightPan.push(coin)
        } else if (rightPan.includes(coin)) {
          rightPan = rightPan.filter(c => c !== coin)
        } else {
          leftPan.push(coin)
        }
      }
      markDirty()
      return
    }
    if (accuseMode) {
      if (lightBtnAt(x, y) || heavyBtnAt(x, y)) {
        if (accuseSel === null) {
          showToast('先点选一枚硬币')
          return
        }
        doAccuse(accuseSel, heavyBtnAt(x, y))
      }
      return
    }
    if (weighBtnAt(x, y)) doWeigh()
    else if (clearBtnAt(x, y)) {
      leftPan = []
      rightPan = []
      markDirty()
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      startLevel(level)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (!running || state.status !== 'playing') {
      return
    } else if (event.code === 'Space') {
      event.preventDefault()
      doWeigh()
    } else if (event.code === 'Enter') {
      event.preventDefault()
      accuseMode = !accuseMode
      accuseSel = null
      markDirty()
    } else if (event.code === 'KeyA') {
      event.preventDefault()
      toggleAssistant()
    } else if (accuseMode && accuseSel !== null && (event.code === 'KeyH' || event.code === 'KeyL')) {
      event.preventDefault()
      doAccuse(accuseSel, event.code === 'KeyH')
    }
  }

  // 脏标记渲染：静止局面零重绘；倾斜缓动、粒子与限时秒数变化时逐帧。
  const loop = createFrameLoop(f => {
    if (toast !== null && performance.now() > toastUntil) {
      toast = null
      markDirty()
    }
    const animating = tickScalesView(view, f.dt)
    let timing = false
    if (deadlineAt > 0) {
      const remainMs = deadlineAt - performance.now()
      if (remainMs <= 0) {
        state = expire(state)
        deadlineAt = 0
        markDirty()
      } else {
        const sec = Math.ceil(remainMs / 1000)
        if (sec !== shownSecond) {
          shownSecond = sec
          timing = true
        }
      }
    }
    const remaining = deadlineAt > 0 ? Math.max(0, (deadlineAt - performance.now()) / 1000) : null
    const bursting = particles.size() > 0
    if (f.render || animating || bursting || timing) {
      renderScales(ctx, LOGICAL_W, LOGICAL_H, state, view, leftPan, rightPan, accuseMode, accuseSel,
        assistantOn, remaining, !running, toast)
      particles.tick(ctx, f.dt * 1000)
      if (animating || bursting) markDirty()
    }
  }, { mode: 'dirty' })

  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }
  const pause = (): void => {
    if (!running) return
    running = false
    if (advanceTimer !== 0) {
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = Math.max(0, advanceAt - performance.now())
    }
    if (deadlineAt > 0) {
      deadlineRemaining = Math.max(0, deadlineAt - performance.now())
      deadlineAt = 0
    }
    loop.pause()
    renderScales(ctx, LOGICAL_W, LOGICAL_H, state, view, leftPan, rightPan, accuseMode, accuseSel,
      assistantOn, deadlineRemaining > 0 ? deadlineRemaining / 1000 : null, true, toast)
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (advanceRemaining > 0) {
      scheduleAdvance(advanceRemaining)
      advanceRemaining = 0
    }
    if (deadlineRemaining > 0) {
      deadlineAt = performance.now() + deadlineRemaining
      deadlineRemaining = 0
    }
    markDirty()
    loop.resume()
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  startDeadline()
  loop.start()

  return {
    start: resume,
    pause,
    resume,
    destroy: () => {
      running = false
      loop.destroy()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const scalesGame: MiniGameDefinition = {
  id: 'scales',
  title: '天平称重 Scales',
  icon: '💰',
  description: '十二枚硬币一枚假——只用三次天平，找出它还要说出轻重。',
  controls: [
    '点硬币入左盘/右盘 · 空格：称量 · Enter：指认（点币 + 选轻/重）',
    'A：推理助手（计分减半）· H/L：指认偏重/偏轻',
    'R：重开 · P：暂停',
  ],
  create: createScalesGame,
}
