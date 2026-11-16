/**
 * 水排序 WaterSort 游戏定义：把纯逻辑控制器接成 {@link MiniGameInstance}。
 * 交互为点源管再点目标管倾倒；U 撤回、A 加一根空管（每关一次）、
 * R 重开本关（同种子同盘面）、P 暂停。全部试管纯色即过关（上报
 * onScore，1.6s 后自动下一关，第 5 关通关后停在残局重开）。死局时
 * 画面给出重开/加管提示。脏标记渲染：倾倒动画与粒子期间逐帧重绘。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import { WaterSortGame, clampLevel, isDeadlocked, isTubeComplete, pourAmount } from './logic.ts'
import { LOGICAL_H, LOGICAL_W, createWaterSortView, renderWaterSort, startPourAnim, tickWaterSortView, tubeAt, tubeRects } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { THEME, createParticles } from '../theme.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

const ADVANCE_MS = 1600
const TOAST_MS = 1100

function createWaterSortGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: watersort needs a 2d canvas context')
  const ctx = fit.ctx

  // 每次激活随机一局种子；重开（R）与关卡推进都在此种子上派生，可复现。
  const seed = Math.floor(Math.random() * 0x7fffffff)
  let level = 1
  let game = new WaterSortGame(level, seed + level)
  let view = createWaterSortView()
  let selected: number | null = null
  let toast: string | null = null
  let toastUntil = 0
  let running = false
  let advanceTimer = 0
  let advanceAt = 0
  let advanceRemaining = 0
  let lastScore = -1
  const particles = createParticles()

  const reportScore = (): void => {
    if (level === lastScore) return
    lastScore = level
    options?.onScore?.(level)
  }

  const startLevel = (next: number): void => {
    level = clampLevel(next)
    game = new WaterSortGame(level, seed + level)
    view = createWaterSortView()
    selected = null
    toast = null
    loop.markDirty()
  }

  const scheduleAdvance = (delayMs: number): void => {
    advanceAt = performance.now() + delayMs
    advanceTimer = window.setTimeout(() => {
      advanceTimer = 0
      startLevel(level + 1)
    }, delayMs)
  }

  const showToast = (msg: string): void => {
    toast = msg
    toastUntil = performance.now() + TOAST_MS
    loop.markDirty()
  }

  /** 提交一次倾倒：先取倒量与颜色供动画，成功后触发水流弧线、
   * 过关粒子/计分或死局提示。 */
  const commitPour = (from: number, to: number): void => {
    if (game.state.status !== 'playing') return
    const amount = pourAmount(game.state.tubes, from, to)
    const src = game.state.tubes[from]!
    const color = src[src.length - 1]!
    if (!game.pour(from, to)) {
      showToast('倒不进去：目标管顶色不同或已满')
      return
    }
    if (amount > 0) startPourAnim(view, from, to, color, amount)
    const next = game.state
    if (next.status === 'won') {
      // 每根完成管口上方爆开庆祝粒子。
      const rects = tubeRects(next.tubes.length)
      for (let i = 0; i < next.tubes.length; i += 1) {
        if (!isTubeComplete(next.tubes[i]!)) continue
        const rect = rects[i]!
        particles.burst(rect.x + rect.w / 2, rect.y - 6, THEME.good, 10, 130)
      }
      particles.burst(LOGICAL_W / 2, LOGICAL_H / 2 - 60, THEME.accents[2]!, 12, 150)
      reportScore()
      if (running) scheduleAdvance(ADVANCE_MS)
      else advanceRemaining = ADVANCE_MS
    } else if (isDeadlocked(next.tubes)) {
      showToast('死局：R 重开 / A 加管')
    }
    loop.markDirty()
  }

  /** 点击试管：未选则选为源；点同管取消；否则倾倒。 */
  const clickTube = (i: number): void => {
    if (game.state.status !== 'playing') return
    if (selected === null) {
      if (game.state.tubes[i]!.length === 0) {
        showToast('空管只能作为目标')
        return
      }
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
    commitPour(from, i)
  }

  const undo = (): void => {
    if (game.state.status !== 'playing') return
    if (!game.undo()) return
    selected = null
    loop.markDirty()
  }

  const addTube = (): void => {
    if (game.state.status !== 'playing') return
    if (game.addTube()) showToast('已加一根空管')
    else showToast('本关的加管已用掉')
    loop.markDirty()
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (!running || game.state.status !== 'playing') return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const tube = tubeAt(x, y, game.state.tubes.length)
    if (tube !== null) clickTube(tube)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      clearTimeout(advanceTimer)
      advanceTimer = 0
      advanceRemaining = 0
      game.reset()
      view = createWaterSortView()
      selected = null
      toast = null
      loop.markDirty()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyU' || event.code === 'Backspace') {
      event.preventDefault()
      if (!running) return
      undo()
    } else if (event.code === 'KeyA') {
      event.preventDefault()
      if (!running) return
      addTube()
    }
  }

  // 脏标记渲染：静态局面不重绘；倾倒动画、粒子与提示计时期间逐帧。
  const loop = createFrameLoop(f => {
    if (toast !== null && performance.now() > toastUntil) {
      toast = null
      loop.markDirty()
    }
    const animating = tickWaterSortView(view, f.dt)
    const bursting = particles.size() > 0
    if (f.render || animating || bursting) {
      renderWaterSort(ctx, LOGICAL_W, LOGICAL_H, game.state, view, selected, !running, toast)
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
    renderWaterSort(ctx, LOGICAL_W, LOGICAL_H, game.state, view, selected, true, toast)
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

export const watersortGame: MiniGameDefinition = {
  id: 'watersort',
  title: '水排序 WaterSort',
  icon: '\u{1F9EA}',
  description: '把混色的水倒来倒去，直到每根试管都是纯色——简单规则，越玩越深。',
  controls: [
    '点试管选源 · 点另一根倾倒（顶段整段倒入）',
    'U：撤回 · A：加一根空管（每关一次）',
    'R：重开 · P：暂停',
  ],
  create: createWaterSortGame,
}
