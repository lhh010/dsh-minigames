/**
 * 传送带工厂 Factory 装配层：把纯逻辑与渲染接成 MiniGameInstance——
 * 点击工具面板选传送带/机器/擦除，点击空地放置、点击已放件旋转，
 * 右键移除，滚轮转向；Enter/空格运行模拟（可视化物品流动）或停止重摆，
 * R 重开、P 暂停、[ ] 切换关卡、B/M/E 快捷选工具。摆盘期为 dirty 按需
 * 重绘，模拟期逐帧推进（每 150ms 一个模拟 tick）。
 */
import type { MiniGameDefinition, MiniGameInstance, MiniGameMountOptions } from '../types.ts'
import { createSim, getLevels, validatePlacements, type Dir, type FactoryLevel, type Placement } from './logic.ts'
import { renderFactory, VIEW_W, VIEW_H, boardMetrics, cellAt, paletteHit, type FactoryView } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'
import { createParticles } from '../theme.ts'

/** 模拟期一个逻辑 tick 的时长 ms。 */
const STEP_MS = 150

function createFactoryGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, VIEW_W, VIEW_H)
  if (fit === null) throw new Error('dsh-minigames: factory needs a 2d canvas context')
  const ctx = fit.ctx
  const levels = getLevels()
  let levelIndex = 0
  let cleared = 0

  const freshView = (): FactoryView => {
    const level: FactoryLevel = levels[levelIndex]!
    return {
      level,
      placements: [],
      tool: 'belt',
      cursorDir: 1,
      hover: null,
      mode: 'edit',
      paused: false,
      message: '',
      messageTtl: 0,
      levelCount: levels.length,
      sim: null,
      failReason: '',
      particles: createParticles(),
      time: 0,
    }
  }
  let view = freshView()
  let running = true
  let paused = false
  let sim: ReturnType<typeof createSim> | null = null
  let stepAcc = 0

  const markDirty = (): void => loop.markDirty()
  const flash = (text: string): void => {
    view.message = text
    view.messageTtl = 2200
    markDirty()
  }

  /** 放置 / 旋转 / 移除（编辑态核心编辑操作）。 */
  const placeAt = (x: number, y: number): void => {
    const level = view.level
    const idx = y * level.w + x
    const existing = view.placements.find((p) => p.y * level.w + p.x === idx)
    if (view.tool === 'erase') {
      if (existing !== undefined) {
        view.placements = view.placements.filter((p) => p !== existing)
        markDirty()
      }
      return
    }
    if (existing !== undefined) {
      view.placements = view.placements.map((p) =>
        p === existing ? { ...p, dir: ((p.dir + 1) % 4) as Dir } : p)
      markDirty()
      return
    }
    if (level.cells[idx] !== 0) {
      flash('这里不能放置（岩石 / 出口源 / 需求槽格）')
      return
    }
    if (view.placements.length >= level.maxPieces) {
      flash('放置数已达上限 ' + String(level.maxPieces) + ' 件（右键移除多余件）')
      return
    }
    if (view.tool === 'belt') {
      view.placements.push({ x, y, dir: view.cursorDir, type: 'belt' })
    } else {
      view.placements.push({ x, y, dir: view.cursorDir, type: 'machine', machine: view.tool })
    }
    markDirty()
  }

  /** 开始运行：校验放置并创建模拟器。 */
  const startRun = (): void => {
    const error = validatePlacements(view.level, view.placements)
    if (error !== null) {
      flash(error)
      return
    }
    sim = createSim(view.level, view.placements)
    view.sim = sim
    view.mode = 'run'
    stepAcc = 0
    markDirty()
  }

  /** 停止模拟回到摆盘（放置保留）。 */
  const stopRun = (): void => {
    sim = null
    view.sim = null
    view.mode = 'edit'
    markDirty()
  }

  const nextLevel = (): void => {
    levelIndex = (levelIndex + 1) % levels.length
    sim = null
    view = freshView()
    markDirty()
  }

  const onPoint = (event: MouseEvent): void => {
    if (paused || view.mode !== 'edit') return
    const rect = canvas.getBoundingClientRect()
    const px = (event.clientX - rect.left) * (VIEW_W / rect.width)
    const py = (event.clientY - rect.top) * (VIEW_H / rect.height)
    const tool = paletteHit(px, py, view.level)
    if (tool !== null) {
      view.tool = tool
      markDirty()
      return
    }
    const cell = cellAt(px, py, view.level)
    if (cell !== null) placeAt(cell.x, cell.y)
  }

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
    if (paused || view.mode !== 'edit') return
    const rect = canvas.getBoundingClientRect()
    const px = (event.clientX - rect.left) * (VIEW_W / rect.width)
    const py = (event.clientY - rect.top) * (VIEW_H / rect.height)
    const cell = cellAt(px, py, view.level)
    if (cell === null) return
    const idx = cell.y * view.level.w + cell.x
    view.placements = view.placements.filter((p) => p.y * view.level.w + p.x !== idx)
    markDirty()
  }

  const onMove = (event: MouseEvent): void => {
    if (view.mode !== 'edit') return
    const rect = canvas.getBoundingClientRect()
    const px = (event.clientX - rect.left) * (VIEW_W / rect.width)
    const py = (event.clientY - rect.top) * (VIEW_H / rect.height)
    const cell = cellAt(px, py, view.level)
    const same = (view.hover !== null && cell !== null
      && view.hover.x === cell.x && view.hover.y === cell.y)
    if (!same) {
      view.hover = cell
      markDirty()
    }
  }

  const onLeave = (): void => {
    if (view.hover !== null) {
      view.hover = null
      markDirty()
    }
  }

  const onWheel = (event: WheelEvent): void => {
    if (paused || view.mode !== 'edit') return
    event.preventDefault()
    view.cursorDir = ((view.cursorDir + (event.deltaY > 0 ? 1 : 3)) % 4) as Dir
    markDirty()
  }

  /** M 键在关卡机器种类间循环。 */
  const cycleMachineTool = (): void => {
    const ids = view.level.machines.map((k) => k.id)
    const at = ids.indexOf(view.tool)
    view.tool = at >= 0 ? ids[(at + 1) % ids.length]! : (ids[0] ?? 'belt')
    markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.code === 'Space' || event.code === 'Enter') {
      event.preventDefault()
      if (paused) return
      if (view.mode === 'edit') startRun()
      else if (view.mode === 'run') stopRun()
      else if (view.mode === 'won') nextLevel()
      else stopRun()
    } else if (event.code === 'KeyR') {
      event.preventDefault()
      sim = null
      view = freshView()
      markDirty()
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      togglePause()
    } else if (event.code === 'KeyB') {
      event.preventDefault()
      if (view.mode === 'edit') {
        view.tool = 'belt'
        markDirty()
      }
    } else if (event.code === 'KeyM') {
      event.preventDefault()
      if (view.mode === 'edit') cycleMachineTool()
    } else if (event.code === 'KeyE') {
      event.preventDefault()
      if (view.mode === 'edit') {
        view.tool = 'erase'
        markDirty()
      }
    } else if (event.code === 'BracketRight') {
      event.preventDefault()
      nextLevel()
    } else if (event.code === 'BracketLeft') {
      event.preventDefault()
      levelIndex = (levelIndex - 1 + levels.length) % levels.length
      sim = null
      view = freshView()
      markDirty()
    }
  }

  const togglePause = (): void => {
    paused = !paused
    view.paused = paused
    markDirty()
  }

  /** 模拟一个 tick 后的收尾：过关粒子 / 终局判定。 */
  const afterStep = (): void => {
    if (sim === null) return
    if (sim.status === 'running') return
    const m = boardMetrics(view.level)
    if (sim.status === 'won') {
      view.mode = 'won'
      cleared += 1
      options?.onScore?.(cleared)
      for (const d of view.level.demands) {
        view.particles.burst(m.bx + d.x * m.cell + m.cell / 2, m.by + d.y * m.cell + m.cell / 2, THEME_GOOD, 24, 180)
      }
    } else {
      view.mode = 'fail'
      view.failReason = '限时 ' + String(view.level.ticks) + ' tick 内需求槽未集齐'
    }
    markDirty()
  }

  const frame = (f: FrameInfo): void => {
    if (paused) {
      if (f.render) renderFactory(ctx, view, 0)
      return
    }
    const dtMs = Math.min(f.dt * 1000, 50)
    view.time += dtMs
    let dirty = false
    if (view.messageTtl > 0) {
      view.messageTtl -= dtMs
      if (view.messageTtl <= 0) view.message = ''
      dirty = true
    }
    if (view.mode === 'run' && sim !== null) {
      stepAcc += dtMs
      while (stepAcc >= STEP_MS && sim.status === 'running') {
        stepAcc -= STEP_MS
        sim.step()
        dirty = true
      }
      afterStep()
    }
    if (view.particles.size() > 0 || view.mode === 'run') dirty = true
    if (dirty) markDirty()
    if (f.render) renderFactory(ctx, view, dtMs)
  }

  const loop = createFrameLoop(frame, { mode: 'dirty' })
  const pause = (): void => {
    if (paused) return
    paused = true
    view.paused = true
    markDirty()
  }
  const resume = (): void => {
    if (!paused) return
    paused = false
    view.paused = false
    markDirty()
  }

  canvas.addEventListener('click', onPoint)
  canvas.addEventListener('contextmenu', onContextMenu)
  canvas.addEventListener('mousemove', onMove)
  canvas.addEventListener('mouseleave', onLeave)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderFactory(ctx, view, 0)

  return {
    start: (): void => {
      if (running) return
      running = true
      loop.start()
    },
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('click', onPoint)
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mouseleave', onLeave)
      canvas.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

/** 过关粒子用的共享亮绿色（避免从 theme 命名空间多导入一处）。 */
const THEME_GOOD = '#9ece6a'

export const factoryGame: MiniGameDefinition = {
  id: 'factory',
  title: '传送带工厂 Factory',
  icon: '🏭',
  description: '铁矿石进去钢梁出来——摆好传送带和机器，让原料流水线自己转起来。',
  controls: [
    '摆盘：点击面板选 传送带/机器（B/M/E 快捷切换），点击空地放置、点击已放件旋转 90°，右键移除，滚轮预置朝向——机器的朝向 = 出料口方向，物料从任意相邻带进入',
    '物理：每 tick 物料沿带向走一格，带须首尾衔接；机器吞齐配方原料后按周期（角标 A+B→C 等）在出口带吐出成品；同格相撞/对头互撞会堵死红显',
    '运行：Enter/空格 运行或停止重摆；源每隔数 tick 产出原料 A/B，需求槽集齐订单数（进度条）即过关，限时 tick 耗尽则失败',
    '注意：物品只沿带流动、不会走进空地；需求槽只收订单上的成品，送错料会堵在槽前',
    'R 重开本关（清空摆放）· [ ] 切换关卡 · P 暂停',
  ],
  create: createFactoryGame,
}
