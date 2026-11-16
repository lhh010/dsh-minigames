/**
 * 炼金工坊游戏定义：把纯合成逻辑接成 {@link MiniGameInstance} —— 点元素架
 * 入工作台两槽，两槽齐即自动尝试合成（发现/重复/无反应三种反馈）；Tab 开
 * 关元素图鉴，H 消耗里程碑配额换取半配方提示，R 重开，P 暂停。五段
 * 里程碑（发现 15/25/35/45/55 种）即五关递进；得分经 onScore 上报。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import { combine, createInitialState, hintBudget, isComplete, milestoneLevel, nameOf, requestHint, scoreOf, type AlchemyState } from './logic.ts'
import { renderAlchemy, codexMaxScroll, hitUi, shelfItemAt, shelfMaxScroll, LOGICAL_H, LOGICAL_W, RESULT_RECT, type AlchemyView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createParticles, THEME } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** 合成动画时长（毫秒）。 */
const MERGE_MS = 700

/** 每局新种子的来源：时间戳异或递增计数器。 */
let restartCounter = 0
function nextSeed(): number {
  restartCounter = (restartCounter + 1) >>> 0
  return (Date.now() ^ Math.imul(restartCounter, 0x9e3779b9)) >>> 0
}

function createAlchemyGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: alchemy needs a 2d canvas context')
  const ctx = fit.ctx

  let state: AlchemyState = createInitialState(nextSeed())
  let slots: Array<string | null> = [null, null]
  let message = '点选两个元素开始炼金'
  let messageKind: 'good' | 'bad' | 'info' = 'info'
  let merge: { a: string; b: string; result: string | null; t: number } | null = null
  let shelfScroll = 0
  let codexOpen = false
  let codexScroll = 0
  let paused = false
  let running = false
  let clearedLevel: number | null = null
  let complete = false
  let lastScore = -1
  const particles = createParticles()

  const reportScore = (): void => {
    const score = scoreOf(state)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  /** R：整局重开（发现、已试组合、提示、槽位全部归零）。 */
  const restart = (): void => {
    state = createInitialState(nextSeed())
    slots = [null, null]
    message = '点选两个元素开始炼金'
    messageKind = 'info'
    merge = null
    shelfScroll = 0
    codexOpen = false
    codexScroll = 0
    paused = false
    clearedLevel = null
    complete = false
    reportScore()
    loop.markDirty()
  }

  // 结算结果的挂载位：attempt 时写入，动画结束帧读取。
  let settleOutcome: ReturnType<typeof combine> = { type: 'none' }

  /** 动画结束后的结算：文案、粒子、里程碑/通关判定。 */
  const settleMerge = (): void => {
    const outcome = settleOutcome
    if (outcome.type === 'new') {
      message = '✦ 发现新元素「' + nameOf(outcome.element) + '」！'
      messageKind = 'good'
      particles.burst(RESULT_RECT.x + RESULT_RECT.w / 2, RESULT_RECT.y + RESULT_RECT.h / 2, THEME.good, 22, 150)
      const level = milestoneLevel(state.discovered.length)
      if (level >= 5) {
        complete = true
      } else if (level > 0 && clearedLevel === null && level > milestoneLevel(state.discovered.length - 1)) {
        clearedLevel = level
      }
      reportScore()
    } else if (outcome.type === 'repeat') {
      message = '「' + nameOf(outcome.element) + '」已经在图鉴里了'
      messageKind = 'info'
    } else {
      message = '似乎什么也没发生……（组合已记录）'
      messageKind = 'bad'
    }
  }

  /** 两槽齐：立刻判定状态并播放合成动画（动画期间锁输入）。 */
  const attempt = (): void => {
    const a = slots[0]
    const b = slots[1]
    if (a == null || b == null || paused || !running || merge !== null) return
    const outcome = combine(state, a, b)
    settleOutcome = outcome
    merge = {
      a,
      b,
      result: outcome.type === 'none' ? null : outcome.element,
      t: 0,
    }
    slots = [null, null]
    loop.markDirty()
  }

  /** 点元素架：优先填空槽；两槽全满则先清空再放入首槽。 */
  const pick = (id: string): void => {
    if (paused || !running || merge !== null || clearedLevel !== null || complete) return
    if (slots[0] != null && slots[1] != null) slots = [id, null]
    else if (slots[0] == null) slots = [id, slots[1] ?? null]
    else slots = [slots[0] ?? null, id]
    loop.markDirty()
    attempt()
  }

  const clearSlots = (): void => {
    if (merge !== null) return
    slots = [null, null]
    loop.markDirty()
  }

  /** H：请求半配方提示（配额 = 已达成里程碑数）。 */
  const hint = (): void => {
    if (paused || !running || complete || clearedLevel !== null) return
    const result = requestHint(state)
    if (result.type === 'hint') {
      message = '提示：「' + nameOf(result.element) + '」的配方需要「' + nameOf(result.ingredient) + '」…（另一半自己想）'
      messageKind = 'info'
    } else if (result.type === 'exhausted') {
      message = '提示配额不足——达成下一段里程碑解锁更多'
      messageKind = 'info'
    } else {
      message = '没有可提示的元素了'
      messageKind = 'info'
    }
    loop.markDirty()
  }

  /** 空格：过关覆盖层继续；通关后整局重来。 */
  const advance = (): void => {
    if (paused || !running) return
    if (complete) {
      restart()
      return
    }
    if (clearedLevel !== null) {
      clearedLevel = null
      loop.markDirty()
    }
  }

  const togglePause = (): void => {
    if (complete) return
    paused = !paused
    loop.markDirty()
  }

  const toggleCodex = (): void => {
    codexOpen = !codexOpen
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.code === 'Tab') {
      event.preventDefault()
      toggleCodex()
      return
    }
    if (event.code === 'Space') {
      event.preventDefault()
      advance()
      return
    }
    if (event.code === 'KeyH') {
      event.preventDefault()
      hint()
      return
    }
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
      return
    }
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    }
    if (event.code === 'KeyC') {
      event.preventDefault()
      clearSlots()
    }
  }

  const toLogical = (event: MouseEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * LOGICAL_W) / rect.width,
      y: ((event.clientY - rect.top) * LOGICAL_H) / rect.height,
    }
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running) return
    focusGameHost(host)
    if (codexOpen) {
      toggleCodex()
      return
    }
    if (paused || complete || clearedLevel !== null) {
      advance()
      return
    }
    const { x, y } = toLogical(event)
    const hit = hitUi(x, y)
    if (hit === 'clear') {
      clearSlots()
      return
    }
    if (hit === 'codex') {
      toggleCodex()
      return
    }
    if (hit === 'hint') {
      hint()
      return
    }
    if (hit === 0 || hit === 1) {
      slots[hit] = null
      loop.markDirty()
      return
    }
    const id = shelfItemAt(x, y, shelfScroll, state.discovered)
    if (id !== null) pick(id)
  }

  const onWheel = (event: WheelEvent): void => {
    if (!running) return
    event.preventDefault()
    const delta = event.deltaY > 0 ? 28 : -28
    if (codexOpen) {
      codexScroll = Math.max(0, Math.min(codexMaxScroll(), codexScroll + delta))
    } else {
      shelfScroll = Math.max(0, Math.min(shelfMaxScroll(state.discovered), shelfScroll + delta))
    }
    loop.markDirty()
  }

  const view = (): AlchemyView => ({
    discovered: state.discovered,
    slots,
    message,
    messageKind,
    merge,
    shelfScroll,
    codexOpen,
    codexScroll,
    paused,
    clearedLevel,
    complete,
    hintBudget: Math.max(0, hintBudget(state)),
    hints: state.hints,
    score: scoreOf(state),
  })

  // 脏标记渲染：静态盘面只在状态或动效（合成动画/粒子）变化时重绘。
  const loop = createFrameLoop(f => {
    const dtMs = f.dt * 1000
    let animating = false
    if (merge !== null) {
      merge.t += dtMs / MERGE_MS
      if (merge.t >= 1) {
        merge = null
        settleMerge()
      }
      animating = true
    }
    if (particles.size() > 0) animating = true
    if (f.render || animating) {
      renderAlchemy(ctx, view())
      particles.tick(ctx, dtMs)
      if (animating) loop.markDirty()
    }
  }, { mode: 'dirty' })

  const pause = (): void => {
    running = false
    loop.pause()
    renderAlchemy(ctx, view())
  }
  const resume = (): void => {
    if (running) return
    running = true
    loop.markDirty()
    loop.resume()
  }

  reportScore()
  loop.markDirty()

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('keydown', onKeyDown)

  return {
    start(): void {
      focusGameHost(host)
      resume()
    },
    pause,
    resume,
    destroy(): void {
      loop.destroy()
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

/** 炼金工坊：Little Alchemy 式合成发现小游戏。 */
export const alchemyGame: MiniGameDefinition = {
  id: 'alchemy',
  title: '炼金工坊 Alchemy',
  icon: '⚗️',
  description: '火加水产汽，汽加岩浆造石——几百种组合等你发现，元素图鉴就是你的进度。',
  controls: [
    '点击元素架入槽 · 两槽齐自动合成',
    'C 清空 · Tab 图鉴 · H 提示（里程碑解锁）',
    '滚轮 翻动元素架/图鉴 · 空格 继续',
    'R 重开 · P 暂停',
  ],
  create: createAlchemyGame,
}