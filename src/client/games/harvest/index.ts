/**
 * 收获季节游戏定义：回合制轮作规划接成 MiniGameInstance。点击卡池换
 * 待种作物、点击动作按钮（或 1-4）切换动作、点击田格执行当前动作、
 * 空格下一周/确认下一季、R 重开整局、P 暂停。dirty 帧循环：交互、
 * 结算与粒子期间标记重绘，静止时零重绘。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  CROP_POOL, createHarvestState, fallowTile, harvestTile, nextSeason, nextWeek,
  plantCrop, totalAssets, waterTile, type HarvestState,
} from './logic.ts'
import {
  LOGICAL_W, LOGICAL_H, buttonAt, cardAt, renderHarvest, renderHarvestOverlay,
  tileAt, tileCenter,
} from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'
import { createParticles, glow, noGlow, THEME } from '../theme.ts'

function createHarvestGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: harvest needs a 2d canvas context')
  const ctx = fit.ctx
  focusGameHost(host)

  let state: HarvestState = createHarvestState((Date.now() & 0xffffffff) >>> 0, 0)
  let currentAction = 0
  let paused = false
  let lastScore = -1
  const particles = createParticles()

  const reportScore = (): void => {
    const score = totalAssets(state)
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  const restart = (): void => {
    state = createHarvestState((Date.now() & 0xffffffff) >>> 0, 0)
    paused = false
    lastScore = -1
    reportScore()
    loop.markDirty()
  }

  /** 对田格执行当前选中动作；失败给出可见原因（原实现静默 return，
   * 玩家点按无任何反应，误以为按键/点击失效）。 */
  const actOnTile = (index: number): void => {
    if (state.phase !== 'playing' || paused) return
    if (state.actionsLeft <= 0) {
      show('本周动作已用完——按空格进入下一周')
      return
    }
    const tile = state.tiles[index]
    let ok = false
    if (currentAction === 0) {
      if (tile !== undefined && tile.crop !== null) show('这格已经有作物了')
      else {
        const spec = CROP_POOL[state.cardPool[state.selectedCard]!]!
        if (state.money < spec.seedCost) show('资金不足：' + spec.name + '种子需 ' + spec.seedCost + '（当前 ' + state.money + '）')
        else ok = plantCrop(state, index)
      }
    } else if (currentAction === 1) {
      if (tile !== undefined && tile.crop === null) show('空格不能浇水——先播种')
      else ok = waterTile(state, index)
    } else if (currentAction === 2) {
      const value = harvestTile(state, index)
      if (value !== null) {
        ok = true
        const [cx, cy] = tileCenter(index)
        particles.burst(cx, cy, '#e0af68', 10, 120)
      } else if (tile !== undefined && tile.crop === null) show('这格没有作物可收获')
      else show('还没成熟——看格子上的生长阶段')
    } else {
      ok = fallowTile(state, index)
    }
    if (ok) {
      reportScore()
      loop.markDirty()
    }
  }

  /** 失败原因短暂提示（渲染层画在事件行位置）。 */
  let feedback = ''
  let feedbackUntil = 0
  const show = (msg: string): void => {
    feedback = msg
    feedbackUntil = performance.now() + 2200
    loop.markDirty()
    window.setTimeout(() => loop.markDirty(), 2300)
  }

  const advance = (): void => {
    if (paused) return
    if (state.phase === 'playing') {
      nextWeek(state)
      reportScore()
      loop.markDirty()
    } else if (state.phase === 'seasonEnd') {
      const next = nextSeason(state)
      if (next !== null) {
        state = next
        reportScore()
        loop.markDirty()
      }
    }
  }

  const togglePause = (): void => {
    if (state.phase !== 'playing') return
    paused = !paused
    loop.markDirty()
  }

  const loop = createFrameLoop((f) => {
    if (f.render) {
      renderHarvest(ctx, state, currentAction)
      particles.tick(ctx, f.dt * 1000)
      if (particles.size() > 0) loop.markDirty()
      if (feedback !== '' && performance.now() < feedbackUntil) {
        ctx.font = '600 14px system-ui, sans-serif'
        ctx.textAlign = 'center'
        glow(ctx, THEME.bad, 6)
        ctx.fillStyle = THEME.bad
        ctx.fillText(feedback, LOGICAL_W / 2, LOGICAL_H - 18)
        noGlow(ctx)
      }
      renderHarvestOverlay(ctx, state, paused)
    }
  }, { mode: 'dirty' })

  const onMouseDown = (event: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const btn = buttonAt(x, y)
    if (btn !== null) {
      currentAction = btn
      loop.markDirty()
      return
    }
    const card = cardAt(x, y)
    if (card !== null) {
      state.selectedCard = card
      loop.markDirty()
      return
    }
    const tile = tileAt(x, y)
    if (tile !== null) actOnTile(tile)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'KeyR') {
      event.preventDefault()
      restart()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault()
      advance()
    } else if (event.code === 'Digit1' || event.code === 'Digit2' || event.code === 'Digit3' || event.code === 'Digit4') {
      event.preventDefault()
      currentAction = Number(event.code.slice(-1)) - 1
      loop.markDirty()
    }
  }

  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('keydown', onKeyDown)
  loop.start()

  return {
    start(): void {
      loop.start()
    },
    pause(): void {
      loop.pause()
    },
    resume(): void {
      loop.resume()
      loop.markDirty()
    },
    destroy(): void {
      loop.destroy()
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

/** 收获季节：轮作时间线农事规划谜题。 */
export const harvestGame: MiniGameDefinition = {
  id: 'harvest',
  title: '收获季节 Harvest',
  icon: '🌻',
  description: '一块田里种什么、何时收——一个收获季的农事规划。',
  controls: [
    '点击卡片：选种 · 点击田格：执行动作',
    '1-4：播种/浇水/收获/休耕',
    '空格：下一周（季末确认下一季）',
    'R：重开 · P：暂停',
  ],
  create: createHarvestGame,
}

