/**
 * 纸牌接龙游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击选牌、
 * 再点目标移动；对单牌再点一次自动寻找合法目标（优先基础堆）；点击发牌
 * 堆翻牌（空堆回收废牌堆）；U 撤销、D 翻发牌堆、R 开新局（局号 +1，
 * seed+局号决定新牌局）、P 暂停。回合制 dirty 帧循环：无操作零重绘，
 * 分数经 onScore 上报。
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  W, H, createSolitaire, drawStock, findAutoTarget, hitTest, moveToColumn,
  moveToFoundation, selectableSource, undo,
  type CardSource, type SolitaireState,
} from './logic.ts'
import { renderSolitaire, UNDO_BTN } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

/** 初始种子（与局号相加后洗牌；同一局号必然同一牌局）。 */
const BASE_SEED = 20261101

function createSolitaireGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  canvas.style.touchAction = 'none'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, W, H)
  if (fit === null) throw new Error('dsh-minigames: solitaire needs a 2d canvas context')
  const ctx = fit.ctx

  let state: SolitaireState = createSolitaire(BASE_SEED)
  let selected: CardSource | null = null
  let running = false
  let paused = false
  let lastScore = -1

  // 指针位置（CSS 像素）→ 逻辑坐标。
  const toLogical = (event: PointerEvent): { x: number, y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H,
    }
  }

  const reportScore = (): void => {
    if (state.score === lastScore) return
    lastScore = state.score
    options?.onScore?.(state.score)
  }

  /** 执行一次自动移动（选中单牌时再点自身触发）。 */
  const tryAutoMove = (): void => {
    if (selected === null) return
    const target = findAutoTarget(state, selected)
    if (target === null) return
    if (target.to === 'foundation') moveToFoundation(state, selected)
    else moveToColumn(state, selected, target.index)
    selected = null
  }

  /**
   * 点击处理：撤销按钮 > 发牌堆 > 选牌 / 移动 / 自动移动。
   */
  const handleClick = (x: number, y: number): void => {
    if (paused || state.won) return
    // HUD 撤销按钮。
    if (x >= UNDO_BTN.x && x < UNDO_BTN.x + UNDO_BTN.w && y >= UNDO_BTN.y && y < UNDO_BTN.y + UNDO_BTN.h) {
      undoLast()
      return
    }
    const hit = hitTest(state, x, y)
    if (hit === null) {
      selected = null
      return
    }
    // 发牌堆：翻牌（清空选中）。
    if (hit.zone === 'stock') {
      selected = null
      drawStock(state)
      return
    }
    const source = selectableSource(state, hit)
    // 点击目标为列 / 基础堆：若有选中则尝试移动。
    if (selected !== null) {
      if (hit.zone === 'column' && source !== null && source.zone === 'column' && sameSource(selected, source)) {
        // 再点选中的牌：单牌自动找目标。
        tryAutoMove()
        return
      }
      if (hit.zone === 'foundation') {
        if (moveToFoundation(state, selected)) {
          selected = null
          return
        }
      }
      if (hit.zone === 'column') {
        if (moveToColumn(state, selected, hit.index)) {
          selected = null
          return
        }
      }
      if (hit.zone === 'waste' && selected.zone === 'waste') {
        tryAutoMove()
        return
      }
      if (hit.zone === 'foundation' && selected.zone === 'foundation' && selected.index === hit.index) {
        // 基础堆顶拿下来再点自身：换目标列没有明确语义，取消选中。
        selected = null
        return
      }
    }
    // 无选中（或移动失败）：切换选中。
    selected = source
  }

  /** 两个源是否指向同一张牌（列源比较列与序号）。 */
  const sameSource = (a: CardSource, b: CardSource): boolean => {
    if (a.zone !== b.zone) return false
    if (a.zone === 'foundation' && b.zone === 'foundation') return a.index === b.index
    if (a.zone === 'column' && b.zone === 'column') return a.index === b.index && a.cardIndex === b.cardIndex
    return true
  }

  const undoLast = (): void => {
    if (state.won) return
    selected = null
    undo(state)
  }

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    if (paused || state.won) return
    const p = toLogical(event)
    handleClick(p.x, p.y)
    reportScore()
    loop.markDirty()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    if (event.ctrlKey || event.altKey || event.metaKey) return
    switch (event.code) {
      case 'KeyR':
        event.preventDefault()
        reset()
        break
      case 'KeyP':
        event.preventDefault()
        togglePause()
        break
      case 'KeyU':
        event.preventDefault()
        if (running && !paused) undoLast()
        reportScore()
        loop.markDirty()
        break
      case 'KeyD':
        event.preventDefault()
        if (running && !paused && !state.won) {
          selected = null
          drawStock(state)
          reportScore()
          loop.markDirty()
        }
        break
    }
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    reportScore()
    if (f.render) renderSolitaire(ctx, state, selected, paused)
  }
  const loop = createFrameLoop(frame, { mode: 'dirty' })

  const reset = (): void => {
    state = createSolitaire(BASE_SEED, state.gameNo + 1)
    selected = null
    lastScore = -1
    paused = false
    loop.markDirty()
    renderSolitaire(ctx, state, null, false)
  }

  const pause = (): void => {
    if (!running) return
    paused = true
    running = false
    loop.pause()
    renderSolitaire(ctx, state, selected, true)
  }
  const resume = (): void => {
    if (running) return
    running = true
    paused = false
    loop.start()
  }
  const togglePause = (): void => {
    if (running) pause()
    else resume()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
  focusGameHost(host)
  running = true
  loop.start()
  renderSolitaire(ctx, state, null, false)

  return {
    start: resume,
    pause,
    resume,
    destroy: (): void => {
      running = false
      loop.destroy()
      fit.dispose()
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    },
  }
}

export const solitaireGame: MiniGameDefinition = {
  id: 'solitaire',
  title: '纸牌接龙 Solitaire',
  icon: '🃏',
  description: '经典 Klondike：把四种花色从 A 到 K 依次收进基础堆，翻牌与空列自由调度。',
  controls: [
    '点击选牌，再点目标列 / 基础堆移动；对单牌再点一次自动寻找合法目标',
    '点击发牌堆（或 D）翻牌，空堆自动回收废牌堆 · U：撤销一步',
    'R：重开新局 · P：暂停',
  ],
  create: createSolitaireGame,
}
