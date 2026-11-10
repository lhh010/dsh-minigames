/**
 * 倒水谜题 Jugs 游戏定义：把纯逻辑接成 {@link MiniGameInstance}。交互为
 * 点源壶再点目标壶倾倒、点水龙头装满选中壶、点排水槽倒空选中壶；
 * U 撤回、R 重开本关、P 暂停。任一壶达到目标即过关（上报 onScore，
 * 1.6s 后自动下一关）；步数超 par×2 判负。关卡进度持久化（重进恢复到最高关）。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import { applyOp, createJugsState, type JugsOp, type JugsState } from './logic.ts'
import { LOGICAL_H, LOGICAL_W, createJugsView, drainAt, jugAt, jugRect, renderJugs, tapAt, tickJugsView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1600
const TOAST_MS = 1100
/** 撤回历史上限（状态不可变，直接堆叠局面）。 */
const MAX_HISTORY = 200

function createJugsGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: jugs needs a 2d canvas context')
  const ctx = fit.ctx

  let state = createJugsState(Math.min(readLevel('jugs'), 5))
  let view = createJugsView(state)
  let selected: number | null = null
  let toast: string | null = null
  let toastUntil = 0
  let running = false
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let lastScore = -1
  const history: JugsState[] = []
  const particles = createParticles()

  const reportScore = (): void => {
    if (state.level === lastScore) return
    lastScore = state.level
    options?.onScore?.(state.level)
  }

  const startLevel = (next: number): void => {
    state = createJugsState(next)
    saveLevel('jugs', state.level)
    view = createJugsView(state)
    selected = null
    toast = null
    history.length = 0
    loop.markDirty()
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      startLevel(state.level + 1)
    }, delayMs)
  }

  const showToast = (msg: string): void => {
    toast = msg
    toastUntil = performance.now() + TOAST_MS
    loop.markDirty()
  }

  /** 提交一次操作；过关时撑粒子并安排下一关。 */
  const commit = (op: JugsOp, failToast: string): void => {
    if (state.status !== 'playing') return
    const next = applyOp(state, op)
    if (next === null) {
      showToast(failToast)
      return
    }
    history.push(state)
    if (history.length > MAX_HISTORY) history.shift()
    state = next
    if (next.status === 'won') {
      // 在持有目标水量的壶上方爆开庆祝粒子。
      const winJug = next.amounts.findIndex(a => a === next.target)
      if (winJug >= 0) {
        const rect = jugRect(next.capacities, winJug)
        const cx = rect.x + rect.w / 2
        particles.burst(cx, 130, THEME.gold, 16, 150)
        particles.burst(cx, 130, THEME.accents[5], 8, 100)
      }
      reportScore()
      if (running) scheduleAdvance(ADVANCE_MS)
      else advanceRemaining = ADVANCE_MS
    }
    loop.markDirty()
  }

  const undo = (): void => {
    if (state.status !== 'playing') return
    const prev = history.pop()
    if (prev === undefined) return
    state = prev
    selected = null
    loop.markDirty()
  }

  /** 点击壶：未选则选为源；已选同壶取消；否则倾倒。 */
  const clickJug = (i: number): void => {
    if (state.status !== 'playing') return
    if (selected === null) {
      selected = i
      loop.markDirty()
      return
    }
    if (selected === i) {
      selected = null
      loop.markDirty()
      return
    }
    const from = selected
    selected = null
    const fail = state.amounts[from] === 0
      ? '来源壶是空的'
      : '目标壶已满，倒不进去'
    commit({ kind: 'pour', from, to: i }, fail)
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || state.status !== 'playing') return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const jug = jugAt(state.capacities, x, y)
    if (jug !== null) {
      clickJug(jug)
      return
    }
    if (tapAt(x, y)) {
      if (selected === null) {
        showToast('先点选一只壶')
        return
      }
      commit({ kind: 'fill', jug: selected }, '这只壶已经满了')
      return
    }
    if (drainAt(x, y)) {
      if (selected === null) {
        showToast('先点选一只壶')
        return
      }
      commit({ kind: 'empty', jug: selected }, '这只壶是空的')
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      startLevel(state.level)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyU' || event.code === 'Backspace') {
      event.preventDefault()
      if (!running) return
      undo()
    } else if (event.code === 'ArrowLeft' || event.code === 'KeyA'
      || event.code === 'ArrowRight' || event.code === 'KeyD') {
      event.preventDefault()
      if (!running || state.status !== 'playing') return
      const dir = event.code === 'ArrowLeft' || event.code === 'KeyA' ? -1 : 1
      const n = state.capacities.length
      const cur = selected === null ? (dir < 0 ? 0 : -1) : selected
      selected = Math.min(n - 1, Math.max(0, cur + dir))
      loop.markDirty()
    } else if (event.code === 'KeyF' || event.code === 'KeyE') {
      event.preventDefault()
      if (!running || selected === null) return
      if (event.code === 'KeyF') commit({ kind: 'fill', jug: selected }, '这只壶已经满了')
      else commit({ kind: 'empty', jug: selected }, '这只壶是空的')
    }
  }

  // 脏标记渲染：静态局面只在状态、水位缓动或粒子变化时重绘。
  const loop = createFrameLoop(f => {
    if (toast !== null && performance.now() > toastUntil) {
      toast = null
      loop.markDirty()
    }
    const animating = tickJugsView(view, state, f.dt)
    const bursting = particles.size() > 0
    if (f.render || animating || bursting) {
      renderJugs(ctx, LOGICAL_W, LOGICAL_H, state, view, selected, !running, toast)
      particles.tick(ctx, f.dt * 1000)
      if (animating || bursting) loop.markDirty()
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
    loop.pause()
    renderJugs(ctx, LOGICAL_W, LOGICAL_H, state, view, selected, true, toast)
  }
  const resume = (): void => {
    if (running) return
    running = true
    if (advanceRemaining > 0) {
      scheduleAdvance(advanceRemaining)
      advanceRemaining = 0
    }
    loop.markDirty()
    loop.resume()
  }

  canvas.addEventListener('mousedown', onMouseDown)
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
      clearTimeout(advanceTimer)
      advanceTimer = 0
      fit.dispose()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const jugsGame: MiniGameDefinition = {
  id: 'jugs',
  title: '倒水谜题 Jugs',
  icon: '🫗',
  description: '无限的水、有限的壶——倒来倒去量出恰好那一升。',
  controls: [
    '点壶选源 · 点另一壶倾倒 · 点水龙头装满 / 排水槽倒空',
    'F/E：装满/倒空选中壶 · U：撤回',
    'R：重开 · P：暂停',
  ],
  create: createJugsGame,
}
