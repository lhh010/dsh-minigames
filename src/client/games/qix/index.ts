/**
 * 圈地争夺游戏定义：把纯逻辑引擎与渲染层接入面板生命周期——
 * 方向键按住沿边缘滑行 / 垂直切入空地拖笔迹、回边闭合圈地，
 * R 重开整场、P 暂停，continuous 帧循环驱动步进与闪烁动画。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import type { Dir, QixState, QixStatus } from './logic.ts'
import { createQixState, advance, setHeld, startNextLevel, matchWon } from './logic.ts'
import { renderQix, createQixParticles, VIEW_W, VIEW_H } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'

/** 局与局之间的过关提示停留（毫秒）：期间按任意方向键立即进下一关。 */
const LEVEL_HOLD_MS = 2200

/** 方向键到引擎方向的映射。 */
const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

function createQixGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, VIEW_W, VIEW_H)
  if (initialFit === null) throw new Error('dsh-minigames: qix needs a 2d canvas context')
  const ctx = initialFit.ctx
  const particles = createQixParticles()

  let state: QixState = createQixState((Date.now() & 0xffff) | 1)
  let levelClearedAt = 0
  let lastScore = -1

  const reportScore = (): void => {
    if (state.score !== lastScore) {
      lastScore = state.score
      options?.onScore?.(state.score)
    }
  }

  const resetMatch = (): void => {
    state = createQixState((Date.now() & 0xffff) | 1)
    levelClearedAt = 0
    lastScore = -1
    reportScore()
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const dir = KEY_DIRS[event.code]
    if (dir !== undefined) {
      event.preventDefault()
      // 过关停顿期按方向立即进下一关。
      if (state.status === 'levelClear' && !matchWon(state)) {
        startNextLevel(state)
        levelClearedAt = 0
      }
      if (!event.repeat) setHeld(state, dir, true)
      return
    }
    if (event.code === 'KeyR') {
      event.preventDefault()
      resetMatch()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const onKeyUp = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const dir = KEY_DIRS[event.code]
    if (dir !== undefined && !event.repeat) setHeld(state, dir, false)
  }

  // advance 会改变 status；经函数读取避免 TS 对属性字面量类型的窄化误报。
  const statusOf = (s: QixState): QixStatus => s.status
  const loop = createFrameLoop((f) => {
    if (statusOf(state) === 'playing') {
      advance(state, f.dt * 1000)
      const after = statusOf(state)
      if (after === 'levelClear') {
        levelClearedAt = performance.now()
        reportScore()
      } else if (after === 'gameover') {
        reportScore()
      }
    } else if (statusOf(state) === 'levelClear' && !matchWon(state)) {
      if (performance.now() - levelClearedAt > LEVEL_HOLD_MS) {
        startNextLevel(state)
        levelClearedAt = 0
      }
    }
    if (f.render) {
      renderQix(ctx, state, particles, !loop.running && state.status === 'playing', performance.now())
    }
  })

  const togglePause = (): void => {
    if (state.status !== 'playing') return
    if (loop.running) loop.pause()
    else loop.resume()
  }

  const onBlur = (): void => {
    // 失焦时松开全部方向，避免切回来时笔迹失控。
    for (const d of state.held.slice()) setHeld(state, d, false)
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  focusGameHost(host)
  loop.start()
  renderQix(ctx, state, particles, false, performance.now())

  return {
    start: (): void => { loop.resume() },
    pause: (): void => { loop.pause() },
    resume: (): void => { loop.resume() },
    destroy: (): void => {
      loop.destroy()
      initialFit.dispose()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    },
  }
}

export const qixGame: MiniGameDefinition = {
  id: 'qix',
  title: '圈地争夺 Qix',
  icon: '🖍️',
  description: '沿边缘滑动画线圈地——圈得越大越险，巡逻的墨怪随时切断你的笔迹。',
  controls: ['按住 ↑↓←→：沿边缘滑行，朝空地切入拖出笔迹，回到己占区闭合圈地', '圈住不含墨怪的区域即归你 · 占满目标比例过关', 'R：重开 · P：暂停'],
  create: createQixGame,
}
