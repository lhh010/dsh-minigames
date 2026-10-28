/**
 * Tower-defense rendering: the tile board (corridor path, towers, range
 * circles, enemies, projectiles), the HUD strip, and the clickable toolbar
 * (three tower buttons + upgrade/sell). Pure canvas drawing driven by the
 * logic state; hit-testing helpers are exported so index.ts shares the same
 * layout constants for pointer input.
 */
import {
  GRID_H, GRID_W, TOWER_INFO, positionAt, towerStats,
  type TdState, type TowerKind,
} from './logic.ts'
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath, spaced } from '../theme.ts'

export const TILE = 48
export const HUD_H = 44
export const TOOLBAR_H = 68
export const LOGICAL_W = GRID_W * TILE
export const LOGICAL_H = HUD_H + GRID_H * TILE + TOOLBAR_H

const BOARD_X = 0
const BOARD_Y = HUD_H

const TOWER_ORDER: readonly TowerKind[] = ['arrow', 'frost', 'cannon']
const TOWER_GLYPH: Record<TowerKind, string> = { arrow: '🏹', frost: '❄️', cannon: '💣' }
/**
 * Five buttons must fit LOGICAL_W = 528px: 3 tower + upgrade + sell.
 * 5 × 96 + 4 × 10 gaps = 520 + 2 × 4 margin = 528 — a compact grid the
 * previous 128px-wide buttons could never fit (they stacked 3 + overlapped
 * the right pair onto the cannon button).
 */
const BTN_W = 96
const BTN_H = 52
const BTN_GAP = 10
const BTN_Y = LOGICAL_H - TOOLBAR_H + 8
/** Left x of button slot i (0-2 towers, 3 upgrade, 4 sell). */
const btnX = (i: number): number => 4 + i * (BTN_W + BTN_GAP)

export interface ToolbarHit {
  kind: TowerKind | 'upgrade' | 'sell'
}

/** Board tile under logical point (x, y), or null outside the board. */
export function cellAt(x: number, y: number): { tx: number; ty: number } | null {
  const tx = Math.floor((x - BOARD_X) / TILE)
  const ty = Math.floor((y - BOARD_Y) / TILE)
  if (tx < 0 || tx >= GRID_W || ty < 0 || ty >= GRID_H) return null
  return { tx, ty }
}

/** Toolbar button under logical point (x, y), or null outside the toolbar. */
export function toolbarAt(x: number, y: number): ToolbarHit | null {
  if (y < BTN_Y || y > BTN_Y + BTN_H) return null
  for (let i = 0; i < 5; i += 1) {
    const bx = btnX(i)
    if (x >= bx && x <= bx + BTN_W) {
      if (i <= 2) return { kind: TOWER_ORDER[i]! }
      return { kind: i === 3 ? 'upgrade' : 'sell' }
    }
  }
  return null
}

export interface TdView {
  state: TdState
  paused: boolean
  /** Toolbar tower kind currently selected for building. */
  selectedKind: TowerKind | null
  /** Currently selected placed tower (range circle + upgrade/sell target). */
  selectedTowerId: number | null
  /** Hovered board tile for the build ghost, or null. */
  hover: { tx: number; ty: number } | null
}

function drawBoard(ctx: CanvasRenderingContext2D, view: TdView): void {
  const { state } = view
  // Buildable tiles.
  for (let ty = 0; ty < GRID_H; ty += 1) {
    for (let tx = 0; tx < GRID_W; tx += 1) {
      const px = BOARD_X + tx * TILE
      const py = BOARD_Y + ty * TILE
      ctx.fillStyle = state.pathTiles[ty]![tx] ? '#262637' : THEME.panel
      ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2)
      ctx.strokeStyle = 'rgba(52,52,74,0.5)'
      ctx.strokeRect(px + 1.5, py + 1.5, TILE - 3, TILE - 3)
    }
  }
  // Corridor center line through the waypoints.
  ctx.strokeStyle = accent(6)
  ctx.lineWidth = 4
  ctx.setLineDash([7, 7])
  ctx.beginPath()
  for (let i = 0; i < state.path.length; i += 1) {
    const wp = state.path[i]!
    const px = BOARD_X + wp.x * TILE + TILE / 2
    const py = BOARD_Y + wp.y * TILE + TILE / 2
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()
  ctx.setLineDash([])
  ctx.lineWidth = 1
  // Entry / exit markers.
  const first = state.path[0]!
  const last = state.path[state.path.length - 1]!
  ctx.font = '16px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.good
  ctx.fillText('▶', BOARD_X + first.x * TILE + TILE / 2 - 10, BOARD_Y + first.y * TILE + TILE / 2 + 6)
  ctx.fillStyle = THEME.bad
  ctx.fillText('🚩', BOARD_X + last.x * TILE + TILE / 2, BOARD_Y + last.y * TILE + TILE / 2 + 6)
}

function drawTowers(ctx: CanvasRenderingContext2D, view: TdView): void {
  const { state } = view
  const selected = state.towers.find(t => t.id === view.selectedTowerId)
  if (selected !== undefined) {
    const stats = towerStats(selected.kind, selected.level)
    const cx = BOARD_X + selected.tx * TILE + TILE / 2
    const cy = BOARD_Y + selected.ty * TILE + TILE / 2
    ctx.strokeStyle = THEME.gold
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.arc(cx, cy, stats.range * TILE, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }
  for (let i = 0; i < state.towers.length; i += 1) {
    const tower = state.towers[i]!
    const px = BOARD_X + tower.tx * TILE + 3
    const py = BOARD_Y + tower.ty * TILE + 3
    const color = tower.kind === 'arrow' ? accent(0) : tower.kind === 'frost' ? accent(5) : accent(4)
    roundRectPath(ctx, px, py, TILE - 6, TILE - 6, 8)
    ctx.fillStyle = THEME.panelEdge
    ctx.fill()
    ctx.strokeStyle = color
    ctx.stroke()
    ctx.font = '18px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = THEME.text
    ctx.fillText(TOWER_GLYPH[tower.kind], px + (TILE - 6) / 2, py + 22)
    // Level pips.
    for (let lv = 0; lv < tower.level; lv += 1) {
      ctx.fillStyle = color
      ctx.fillRect(px + 7 + lv * 9, py + TILE - 14, 6, 4)
    }
  }
}

function drawEnemies(ctx: CanvasRenderingContext2D, view: TdView): void {
  const { state } = view
  for (const enemy of state.enemies) {
    const pos = positionAt(state.path, enemy.dist)
    const cx = BOARD_X + pos.x * TILE + TILE / 2
    const cy = BOARD_Y + pos.y * TILE + TILE / 2
    const r = enemy.brute ? 13 : 9
    const color = enemy.brute ? THEME.bad : accent(3)
    glow(ctx, color, 8)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    ctx.fillStyle = 'rgba(13,13,20,0.8)'
    ctx.fillRect(cx - r, cy - r - 7, r * 2, 4)
    ctx.fillStyle = THEME.good
    ctx.fillRect(cx - r, cy - r - 7, r * 2 * Math.max(0, enemy.hp / enemy.maxHp), 4)
    if (enemy.slowTime > 0) {
      ctx.strokeStyle = accent(5)
      ctx.beginPath()
      ctx.arc(cx, cy, r + 3, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
}

function drawProjectiles(ctx: CanvasRenderingContext2D, view: TdView): void {
  for (const p of view.state.projectiles) {
    const px = BOARD_X + p.x * TILE + TILE / 2
    const py = BOARD_Y + p.y * TILE + TILE / 2
    const color = p.kind === 'lob' ? accent(4) : p.slowFactor > 0 ? accent(5) : accent(0)
    glow(ctx, color, 8)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(px, py, p.kind === 'lob' ? 5 : 3.5, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
  }
  for (const fx of view.state.effects) {
    const px = BOARD_X + fx.x * TILE + TILE / 2
    const py = BOARD_Y + fx.y * TILE + TILE / 2
    const a = 1 - fx.t / fx.life
    ctx.globalAlpha = a
    ctx.strokeStyle = accent(7)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(px, py, (1 - a) * 26 + 4, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.lineWidth = 1
  }
}

function drawHud(ctx: CanvasRenderingContext2D, view: TdView): void {
  const { state } = view
  ctx.fillStyle = THEME.panel
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  ctx.strokeStyle = THEME.panelEdge
  ctx.beginPath()
  ctx.moveTo(0, HUD_H - 0.5)
  ctx.lineTo(LOGICAL_W, HUD_H - 0.5)
  ctx.stroke()
  ctx.textAlign = 'left'
  hudPair(ctx, 10, 27, '金币', String(state.gold), 'left', THEME.gold)
  hudPair(ctx, 100, 27, '生命', `${'❤'.repeat(state.lives) || '—'}`, 'left', state.lives > 1 ? THEME.bad : THEME.text)
  hudPair(ctx, 186, 27, '波次', `${state.wave}/10`)
  hudPair(ctx, 264, 27, '关卡', String(state.level))
  hudPair(ctx, LOGICAL_W - 10, 27, '分数', String(state.score), 'right')
  if (state.phase === 'build') {
    // Right-aligned next to 分数, separated from the left cluster: the old
    // center anchor overlapped 波次/关卡.
    hudPair(ctx, LOGICAL_W - 130, 27, '来袭', `${Math.ceil(state.buildTimer)}s`, 'right', THEME.textMuted)
  }
}

function drawToolbar(ctx: CanvasRenderingContext2D, view: TdView): void {
  const { state } = view
  ctx.fillStyle = THEME.panel
  ctx.fillRect(0, LOGICAL_H - TOOLBAR_H, LOGICAL_W, TOOLBAR_H)
  for (let i = 0; i < TOWER_ORDER.length; i += 1) {
    const kind = TOWER_ORDER[i]!
    const bx = btnX(i)
    const affordable = state.gold >= TOWER_INFO[kind].cost
    const active = view.selectedKind === kind
    roundRectPath(ctx, bx, BTN_Y, BTN_W, BTN_H, 8)
    ctx.fillStyle = active ? '#2c2c40' : THEME.panelEdge
    ctx.fill()
    ctx.strokeStyle = active ? THEME.gold : affordable ? accent(i) : THEME.textMuted
    ctx.stroke()
    ctx.textAlign = 'left'
    ctx.fillStyle = affordable ? THEME.text : THEME.textMuted
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillText(`${TOWER_GLYPH[kind]} ${TOWER_INFO[kind].name} ${TOWER_INFO[kind].cost}`, bx + 8, BTN_Y + 20)
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    ctx.fillText(kind === 'arrow' ? '快速单体' : kind === 'frost' ? '减速控制' : '范围溅射', bx + 8, BTN_Y + 38)
  }
  const ux = btnX(3)
  const tower = state.towers.find(t => t.id === view.selectedTowerId)
  const upCost = tower !== undefined && tower.level < 3 ? TOWER_INFO[tower.kind].upgrades[tower.level - 1]! : null
  roundRectPath(ctx, ux, BTN_Y, BTN_W, BTN_H, 8)
  ctx.fillStyle = THEME.panelEdge
  ctx.fill()
  ctx.strokeStyle = upCost !== null && state.gold >= upCost ? accent(2) : THEME.textMuted
  ctx.stroke()
  ctx.fillStyle = upCost !== null ? THEME.text : THEME.textMuted
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillText(upCost !== null ? `⬆ 升级 ${upCost}` : '⬆ 已满级', ux + 8, BTN_Y + 20)
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('按 U', ux + 8, BTN_Y + 38)
  const sx = btnX(4)
  roundRectPath(ctx, sx, BTN_Y, BTN_W, BTN_H, 8)
  ctx.fillStyle = THEME.panelEdge
  ctx.fill()
  ctx.strokeStyle = tower !== undefined ? THEME.bad : THEME.textMuted
  ctx.stroke()
  ctx.fillStyle = tower !== undefined ? THEME.text : THEME.textMuted
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillText('💰 出售', sx + 8, BTN_Y + 20)
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('返还 60%', sx + 8, BTN_Y + 38)
  // Build ghost on the hovered tile.
  if (view.hover !== null && view.selectedKind !== null) {
    const htx = view.hover.tx
    const hty = view.hover.ty
    const px = BOARD_X + htx * TILE + 3
    const py = BOARD_Y + hty * TILE + 3
    const ok = !view.state.pathTiles[hty]![htx]
      && !view.state.towers.some(t => t.tx === htx && t.ty === hty)
    ctx.strokeStyle = ok ? THEME.good : THEME.bad
    roundRectPath(ctx, px, py, TILE - 6, TILE - 6, 8)
    ctx.stroke()
    const stats = towerStats(view.selectedKind, 1)
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.arc(px + TILE / 2, py + TILE / 2, stats.range * TILE, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }
}

/** Draw the full game frame (board + HUD + toolbar + overlays). */
export function renderTd(ctx: CanvasRenderingContext2D, view: TdView): void {
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  drawBoard(ctx, view)
  drawTowers(ctx, view)
  drawEnemies(ctx, view)
  drawProjectiles(ctx, view)
  drawHud(ctx, view)
  drawToolbar(ctx, view)
  if (view.state.result === 'lose') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '防守失败', `最终分数 ${view.state.score} · 按 Enter 重开本关`, THEME.bad)
  } else if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, spaced('暂停'), '按 P 继续', THEME.textMuted)
  }
}
