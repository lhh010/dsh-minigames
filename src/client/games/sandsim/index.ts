/**
 * 落沙物语游戏定义：continuous 帧循环内按 30Hz 结算 CA；点击 / 拖拽
 * 用当前工具，1-4 切换工具，空格暂停模拟，R 重开（过关时进下一关），
 * P 暂停整局；金砂收集时爆粒子并按规范上报分数。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import { createSandSimState, stepSim, applyTool, LOGICAL_W, LOGICAL_H, type SandSimState, type Tool } from './logic.ts'
import { renderSandSim, boardOrigin, CELL } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop } from '../frame-scheduler.ts'
import { createParticles } from '../theme.ts'

function randomSeed(): number {
  return (Math.random() * 0x100000000) >>> 0
}

function createSandSimGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const initialFit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (initialFit === null) throw new Error('dsh-minigames: sandsim needs a 2d canvas context')
  const ctx = initialFit.ctx

  let levelIndex = 0
  let state: SandSimState = createSandSimState(randomSeed(), levelIndex)
  let tool: Tool = 'dig'
  let simPaused = false
  let t = 0
  let lastScore = -1
  const particles = createParticles()
  let lastCollected = 0

  const reportScore = (): void => {
    // 分数 = 累计已收集金砂 x10 + 已过关数 x100（过关奖励）。
    const score = (levelIndex * 100) + state.collected * 10
    if (score === lastScore) return
    lastScore = score
    options?.onScore?.(score)
  }

  /** 点击 / 拖拽坐标 -> 网格格；命中棋盘则施加当前工具。 */
  const applyAt = (ev: PointerEvent): void => {
    if (state.over || state.won || simPaused) return
    const rect = canvas.getBoundingClientRect()
    const x = ((ev.clientX - rect.left) / rect.width) * LOGICAL_W
    const y = ((ev.clientY - rect.top) / rect.height) * LOGICAL_H
    const origin = boardOrigin(state)
    const c = Math.floor((x - origin.x) / CELL)
    const r = Math.floor((y - origin.y) / CELL)
    if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return
    applyTool(state, r, c, tool)
    loop.markDirty()
  }

  const onPointerDown = (ev: PointerEvent): void => {
    if ((ev.target as HTMLElement) !== canvas) return
    focusGameHost(host)
    canvas.setPointerCapture(ev.pointerId)
    applyAt(ev)
  }
  const onPointerMove = (ev: PointerEvent): void => {
    if (ev.buttons !== 1) return
    applyAt(ev)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'Digit1' || event.code === 'Digit2' || event.code === 'Digit3' || event.code === 'Digit4') {
      event.preventDefault()
      tool = (['dig', 'rock', 'water', 'sand'] as Tool[])[Number(event.code.slice(5)) - 1]!
      loop.markDirty()
      return
    }
    if (event.code === 'Space') {
      event.preventDefault()
      simPaused = !simPaused
      loop.markDirty()
    } else if (event.code === 'KeyR') {
      event.preventDefault()
      if (state.won && levelIndex < 4) levelIndex += 1
      state = createSandSimState(randomSeed(), levelIndex)
      simPaused = false
      lastCollected = 0
      lastScore = -1
      loop.markDirty()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    }
  }

  const loop = createFrameLoop((f) => {
    t += f.dt
    if (!simPaused) stepSim(state, f.dt)
    if (state.collected !== lastCollected) {
      // 收集闪光：桶口中心爆金色粒子。
      const startC = Math.floor(state.cols / 2) - 2
      const origin = boardOrigin(state)
      particles.burst(origin.x + (startC + 2.5) * CELL, origin.y + (state.rows - 1) * CELL, '#ffd75e', 12, 120)
      lastCollected = state.collected
      loop.markDirty()
    }
    reportScore()
    if (f.render) {
      renderSandSim(ctx, state, t, tool, simPaused)
      particles.tick(ctx, f.dt * 1000)
    }
  })

  const togglePause = (): void => {
    if (loop.running) {
      loop.pause()
      renderSandSim(ctx, state, t, tool, simPaused)
    } else {
      loop.resume()
    }
  }

  const onKeyDownBound = onKeyDown.bind(null)
  window.addEventListener('keydown', onKeyDownBound)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)

  return {
    start(): void { focusGameHost(host); loop.start() },
    pause(): void { loop.pause() },
    resume(): void { loop.resume() },
    destroy(): void {
      loop.destroy()
      window.removeEventListener('keydown', onKeyDownBound)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      initialFit.dispose()
    },
  }
}

/** 落沙物语：确定性落沙元胞自动机解谜——挖岩引金砂入桶。 */
export const sandsimGame: MiniGameDefinition = {
  id: 'sandsim',
  title: '落沙物语 SandSim',
  icon: '🏜',
  description: '沙会流、水会渗、油会浮——挖开岩层把金砂引进桶里。',
  controls: [
    '目标：收集桶在棋盘底部中央（发光▼收集桶▼标记+梯形描边），让金色砂粒落入桶内点亮进度；收满 \u2265N 颗过关，超时或金砂被烧到不足判负',
    '玩法：金砂混在沙里随重力下落——先用「1 挖掘」打通岩层通道让它们落到桶口；水会流动冲走沙、火沿油蔓延烧金砂，善用放岩（2）筑坝导流',
    '点击/拖拽棋盘用当前工具：1 挖掘（清岩，注意水量会冲走布局）2 放岩 3 放水 4 放沙，均有次数限制',
    '沙会下落斜堆，水会下渗并水平流动，油比水轻会上浮；水碰到火会将其熄灭',
    '火会沿油蔓延、烧毁途经的金砂（烧毁不可回收）；金砂比水重会沉底',
    '空格暂停/继续模拟，P 暂停整局，R 重开本关（过关时进入下一关）',
  ],
  create: createSandSimGame,
}