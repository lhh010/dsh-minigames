/**
 * 冰面滑行游戏定义：把纯逻辑接成 {@link MiniGameInstance}——方向键/WASD
 * 滑行（点击画布上相邻方向同样触发），U 撤回一步，R 重开本关，P 暂停，
 * N 过关后进入下一关；dirty 按需渲染（滑行动画与粒子活跃时才重绘），
 * 分数经 onScore 上报。回合制，无 gameplay 计时器。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  LEVEL_COUNT,
  advanceLevel,
  applySlide,
  createIceState,
  iceScore,
  loadIceLevel,
  resetLevel,
  undoSlide,
  type IceState,
  type SlideDir,
  type SlideResult,
} from './logic.ts'
import {
  LOGICAL_H,
  LOGICAL_W,
  boardMetrics,
  renderIceSlide,
  type IceSlideAnim,
  type IceSlideView,
} from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'
import { THEME, createParticles } from '../theme.ts'

/** 键 → 滑行方向。 */
const KEY_DIR: Record<string, SlideDir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
}

/** 滑行动画时长：基础 + 每格增量（ms）。 */
const SLIDE_BASE_MS = 90
const SLIDE_PER_CELL_MS = 45

function createIceSlideGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: iceslide needs a 2d canvas context')
  const ctx = fit.ctx

  const particles = createParticles()
  let state: IceState = createIceState()
  let running = false
  let paused = false
  let lastScore = -1
  let facing: SlideDir = 'down'
  let anim: (IceSlideAnim & { t: number; dur: number }) | null = null
  let clockMs = 0

  const view = (): IceSlideView => ({
    paused,
    finished: state.finished,
    timeMs: clockMs,
    slide: anim === null ? null : { from: anim.from, path: anim.path, dir: anim.dir, t: anim.t },
    facing,
  })

  const draw = (dtMs = 0): void => {
    renderIceSlide(ctx, state, view(), particles, dtMs)
  }

  /** 分数变化才上报（面板不做节流）。 */
  const reportScore = (): void => {
    const score = iceScore(state)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  /** 在某格中心喷粒子（逻辑坐标）。 */
  const burstAt = (cellIndex: number, color: string, count: number): void => {
    const m = boardMetrics(state.level)
    const x = m.ox + (cellIndex % state.level.w) * m.cell + m.cell / 2
    const y = m.oy + Math.floor(cellIndex / state.level.w) * m.cell + m.cell / 2
    particles.burst(x, y, color, count)
  }

  /** 死亡/过关时的输入路由。 */
  const advanceIfCleared = (): boolean => {
    if (state.status !== 'cleared') return false
    advanceLevel(state)
    anim = null
    facing = 'down'
    reportScore()
    return true
  }

  const doSlide = (dir: SlideDir): void => {
    if (state.status === 'dead') {
      resetLevel(state)
      anim = null
      facing = 'down'
      reportScore()
      loop.markDirty()
      return
    }
    if (advanceIfCleared()) {
      loop.markDirty()
      return
    }
    const result = applySlide(state, dir)
    if (result === null) return
    facing = dir
    startAnim(result)
    for (const g of result.gems) burstAt(g, THEME.gold, 8)
    if (result.cleared) {
      burstAt(result.to, THEME.good, 26)
    } else if (result.outcome === 'spike' || result.outcome === 'fell') {
      const at = result.outcome === 'spike' ? result.to : result.from
      burstAt(at, THEME.bad, 18)
    } else if (result.path.length === 0) {
      burstAt(result.from, THEME.textMuted, 4)
    }
    reportScore()
    loop.markDirty()
  }

  const startAnim = (result: SlideResult): void => {
    if (result.path.length === 0) {
      anim = null
      return
    }
    anim = {
      from: result.from,
      path: result.path,
      dir: result.dir,
      t: 0,
      dur: SLIDE_BASE_MS + result.path.length * SLIDE_PER_CELL_MS,
    }
  }

  const restart = (): void => {
    if (state.finished) {
      state = createIceState()
    } else if (state.status === 'cleared') {
      loadIceLevel(state, state.levelIndex)
    } else {
      resetLevel(state)
    }
    anim = null
    facing = 'down'
    reportScore()
    loop.markDirty()
  }

  const togglePause = (): void => {
    if (paused) resume()
    else pause()
  }
  const pause = (): void => {
    if (!running || paused) return
    paused = true
    loop.pause()
    draw()
  }
  const resume = (): void => {
    if (!running || !paused) return
    paused = false
    loop.resume()
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
      return
    }
    if (paused) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
      return
    }
    if (event.code === 'KeyU') {
      event.preventDefault()
      if (anim !== null || state.status !== 'playing') return
      if (undoSlide(state)) {
        reportScore()
        loop.markDirty()
      }
      return
    }
    if (event.code === 'KeyN') {
      event.preventDefault()
      if (advanceIfCleared()) loop.markDirty()
      return
    }
    const dir = KEY_DIR[event.code]
    if (dir === undefined) return
    event.preventDefault()
    doSlide(dir)
  }

  // 点击（或触摸）画布：取相对玩家的主轴方向滑行；死亡/过关时等价 R/N。
  const onPointerDown = (event: PointerEvent): void => {
    if (paused) return
    event.preventDefault()
    focusGameHost(host)
    if (state.status === 'dead') {
      doSlide('up')
      return
    }
    if (state.status === 'cleared') {
      if (advanceIfCleared()) loop.markDirty()
      return
    }
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const lx = ((event.clientX - rect.left) / rect.width) * LOGICAL_W
    const ly = ((event.clientY - rect.top) / rect.height) * LOGICAL_H
    const m = boardMetrics(state.level)
    const cellX = Math.floor((lx - m.ox) / m.cell)
    const cellY = Math.floor((ly - m.oy) / m.cell)
    const px = state.pos % state.level.w
    const py = Math.floor(state.pos / state.level.w)
    const dx = cellX - px
    const dy = cellY - py
    if (dx === 0 && dy === 0) return
    if (Math.abs(dx) >= Math.abs(dy)) doSlide(dx > 0 ? 'right' : 'left')
    else doSlide(dy > 0 ? 'down' : 'up')
  }

  const frame = (f: FrameInfo): void => {
    if (!running || paused) return
    const dtMs = Math.min(64, f.wallMs)
    clockMs += dtMs
    let animating = false
    if (anim !== null) {
      anim.t = Math.min(1, anim.t + dtMs / anim.dur)
      if (anim.t >= 1) anim = null
      animating = true
    }
    // dirty 模式：仅 dirty 帧、滑行动画或粒子活跃时重绘。
    if (f.render || animating || particles.size() > 0) draw(dtMs)
  }
  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const onBlur = (): void => {
    if (running && !paused) pause()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('blur', onBlur)
  focusGameHost(host)
  running = true
  loop.start()
  draw()
  reportScore()

  return {
    start: (): void => {
      if (running) return
      running = true
      loop.resume()
      loop.markDirty()
    },
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onBlur)
    },
  }
}

export const iceslideGame: MiniGameDefinition = {
  id: 'iceslide',
  title: '冰面滑行 Ice Slide',
  icon: '❄️',
  description: '踏上冰面就停不下来——利用墙壁与障碍规划滑行路线吃到全部宝石。',
  controls: [
    '方向键 / WASD / 点击相邻方向：滑行（撞墙才停），集齐宝石停到出口过关',
    '踩到尖刺或滑出冰面重来本关 · 步数越少奖励越高',
    'U：撤回一步 · N：过关后下一关 · R：重开 · P：暂停',
  ],
  create: createIceSlideGame,
}
