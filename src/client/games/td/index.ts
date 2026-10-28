/**
 * Tower-defense game definition: wires the pure logic into a
 * {@link MiniGameInstance} — 1/2/3 (or toolbar click) selects a tower kind,
 * board clicks build, clicking a placed tower selects it (range circle +
 * upgrade/sell buttons, U upgrades), Space sends the wave early for bonus
 * gold, R restarts the level on the same map seed, P pauses, Enter restarts
 * after a loss. Level progress persists via level-progress.
 */
import type {
  MiniGameDefinition,
  MiniGameInstance,
  MiniGameMountOptions,
} from '../types.ts'
import {
  buildTower, createState, restartLevel, sellTower, sendWaveEarly, step, upgradeTower,
  type TdState, type TowerKind,
} from './logic.ts'
import { LOGICAL_H, LOGICAL_W, cellAt, renderTd, toolbarAt } from './render.ts'
import { fitCanvas } from '../canvas-fit.ts'
import { focusGameHost, gameHasFocus } from '../focus.ts'
import { readLevel, saveLevel } from '../level-progress.ts'
import { createFrameLoop, type FrameInfo } from '../frame-scheduler.ts'

const GAME_ID = 'td'

function createTdGame(host: HTMLElement, options?: MiniGameMountOptions): MiniGameInstance {
  const canvas = document.createElement('canvas')
  canvas.className = 'dmg-game-canvas'
  host.replaceChildren(canvas)
  const fit = fitCanvas(host, canvas, LOGICAL_W, LOGICAL_H)
  if (fit === null) throw new Error('dsh-minigames: td needs a 2d canvas context')
  const ctx = fit.ctx

  const startLevel = readLevel(GAME_ID)
  let state: TdState = createState((Date.now() ^ 0x1d7f5a3b) >>> 0, startLevel)
  let selectedKind: TowerKind | null = null
  let selectedTowerId: number | null = null
  let hover: { tx: number; ty: number } | null = null
  let running = false
  let paused = false
  let lastScore = -1
  let lastLevel = -1

  const reportScore = (): void => {
    if (state.score === lastScore && state.level === lastLevel) return
    lastScore = state.score
    lastLevel = state.level
    options?.onScore?.(Math.max(state.score, state.level * 1000))
  }

  const selectPlaced = (towerId: number | null): void => {
    selectedTowerId = towerId
    if (towerId !== null) selectedKind = null
  }

  const doBuild = (tx: number, ty: number): void => {
    const towerHere = state.towers.find(t => t.tx === tx && t.ty === ty)
    if (towerHere !== undefined) {
      selectPlaced(towerHere.id === selectedTowerId ? null : towerHere.id)
      return
    }
    if (selectedKind === null) return
    if (buildTower(state, selectedKind, tx, ty)) selectPlaced(null)
  }

  const restart = (): void => {
    restartLevel(state)
    selectedKind = null
    selectedTowerId = null
    lastScore = -1
    reportScore()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!gameHasFocus(host)) return
    const k = event.code
    if (k === 'Space' || k.startsWith('Digit')) event.preventDefault()
    if (event.repeat) return
    switch (k) {
      case 'Digit1': selectedKind = selectedKind === 'arrow' ? null : 'arrow'; selectPlaced(null); break
      case 'Digit2': selectedKind = selectedKind === 'frost' ? null : 'frost'; selectPlaced(null); break
      case 'Digit3': selectedKind = selectedKind === 'cannon' ? null : 'cannon'; selectPlaced(null); break
      case 'KeyU':
        if (selectedTowerId !== null) upgradeTower(state, selectedTowerId)
        break
      case 'KeyX':
        if (selectedTowerId !== null) { sellTower(state, selectedTowerId); selectPlaced(null) }
        break
      case 'Space':
        if (state.result === 'none') sendWaveEarly(state)
        break
      case 'KeyR': restart(); break
      case 'Enter': case 'NumpadEnter':
        if (state.result === 'lose') restart()
        break
      case 'KeyP': case 'Escape': togglePause(); break
    }
  }

  const onPointerMove = (event: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    hover = cellAt(x, y)
  }

  const onPointerDown = (event: PointerEvent): void => {
    focusGameHost(host)
    if (!running) return
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) * LOGICAL_W) / rect.width
    const y = ((event.clientY - rect.top) * LOGICAL_H) / rect.height
    const btn = toolbarAt(x, y)
    if (btn !== null) {
      if (btn.kind === 'upgrade') {
        if (selectedTowerId !== null) upgradeTower(state, selectedTowerId)
      } else if (btn.kind === 'sell') {
        if (selectedTowerId !== null) { sellTower(state, selectedTowerId); selectPlaced(null) }
      } else {
        selectedKind = selectedKind === btn.kind ? null : btn.kind
        selectPlaced(null)
      }
      return
    }
    const cell = cellAt(x, y)
    if (cell !== null) doBuild(cell.tx, cell.ty)
  }

  const frame = (f: FrameInfo): void => {
    if (!running) return
    step(state, f.dt)
    if (state.result === 'none' && state.wave === 1 && state.phase === 'build') saveLevel(GAME_ID, state.level)
    reportScore()
    if (f.render) renderTd(ctx, { state, paused, selectedKind, selectedTowerId, hover })
  }

  const loop = createFrameLoop(frame)

  const pause = (): void => {
    if (!running) return
    running = false
    paused = true
    loop.pause()
    renderTd(ctx, { state, paused: true, selectedKind, selectedTowerId, hover })
  }
  const resume = (): void => {
    if (running) return
    running = true
    paused = false
    loop.resume()
  }
  const togglePause = (): void => {
    if (state.result !== 'none') return
    if (running) pause()
    else resume()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
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
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('keydown', onKeyDown)
      fit.dispose()
    },
  }
}

export const tdGame: MiniGameDefinition = {
  id: 'td',
  title: '塔防',
  icon: '🏹',
  description: '在固定路径旁建塔：箭塔速射、冰霜减速、炮塔溅射，守住十波敌人即可进入下一关。',
  controls: [
    '1/2/3 或点工具栏：选塔 · 点击空地建造',
    '点已有塔查看射程 · U 升级（最多3级）· X 出售',
    '空格：提前开战（按剩余秒数奖励金币）',
    'R：重开本关 · P：暂停 · 失败后 Enter 重开',
  ],
  create: createTdGame,
}
