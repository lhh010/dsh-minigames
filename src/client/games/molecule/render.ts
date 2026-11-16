/**
 * 分子构建 (Molecule) 画布渲染器：化学风盘面（网格暗纹 + 墙块）、球形
 * 原子（元素符号 + 外圈剩余空价刻痕，双线键连线）、主原子高亮、推挤
 * 补间动画、目标分子式面板（元素达成点亮）、步数/参考 HUD 与过关
 * overlay（按最终几何缩放展示分子结构）。无状态：全部信息来自传入的
 * state 与 view；共享视觉件来自 ../theme.ts。
 */
import {
  MAX_BOND_ORDER, VALENCE, atomById, freeBonds, shimmerOrder, structureString,
  type Atom, type MoleculeState,
} from './logic.ts'
import { THEME, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'

/** 逻辑画布尺寸（所有关卡共用，盘面居中自适应内嵌）。 */
export const LOGICAL_W = 460
export const LOGICAL_H = 540
/** HUD 高度（两行：关卡/目标 + 元素达成条）。 */
export const HUD_H = 74
/** 单元格边长。 */
export const CELL = 44

/** 元素视觉配置：球体填充色与符号色。 */
const ELEMENT_STYLE: Record<string, { fill: string; text: string; tick: string }> = {
  H: { fill: '#d8d9e6', text: '#1a1a26', tick: '#9aa0b8' },
  C: { fill: '#3b3b52', text: '#e2e2ee', tick: '#bb9af7' },
  N: { fill: '#7aa2f7', text: '#10101a', tick: '#7dcfff' },
  O: { fill: '#f7768e', text: '#16161f', tick: '#ff9e64' },
}

/** 渲染视图：暂停/全通、推挤动画与毫秒时钟。 */
export interface MoleculeView {
  paused: boolean
  /** 最后一关过关（终局画面）。 */
  won: boolean
  /** 进行中的推挤补间；null 为静止。 */
  push: { moved: { id: number; from: { r: number; c: number }; to: { r: number; c: number } }[]; t: number } | null
  /** 毫秒时钟（动画缓动用）。 */
  timeMs: number
}

/** 盘面绘制原点（水平居中，垂直在 HUD 下方居中）。 */
function boardOrigin(state: MoleculeState): { ox: number; ny: number } {
  const ox = (LOGICAL_W - state.cols * CELL) / 2
  const areaH = LOGICAL_H - HUD_H - 26
  const ny = HUD_H + Math.max(0, (areaH - state.rows * CELL) / 2)
  return { ox, ny: ny }
}

/**
 * 某格中心的逻辑坐标（粒子/闪烁定位用）。
 * @param state - 状态。
 * @param r - 行。
 * @param c - 列。
 * @returns 中心点。
 */
export function cellCenter(state: MoleculeState, r: number, c: number): { x: number; y: number } {
  const { ox, ny } = boardOrigin(state)
  return { x: ox + c * CELL + CELL / 2, y: ny + r * CELL + CELL / 2 }
}

/**
 * 某原子中心的逻辑坐标（当前网格位置）。
 * @param state - 状态。
 * @param atom - 原子。
 * @returns 中心点。
 */
export function atomCenter(state: MoleculeState, atom: Atom): { x: number; y: number } {
  return cellCenter(state, atom.r, atom.c)
}

/** 推挤补间下的原子绘制位置（静止时即网格位置）。 */
function drawPos(state: MoleculeState, atom: Atom, push: MoleculeView['push']): { x: number; y: number } {
  if (push === null) return atomCenter(state, atom)
  for (const m of push.moved) {
    if (m.id !== atom.id) continue
    const from = cellCenter(state, m.from.r, m.from.c)
    const to = cellCenter(state, m.to.r, m.to.c)
    const t = push.t
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
  }
  return atomCenter(state, atom)
}

/** 缓动：起步快、落格稳。 */
function ease(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

/**
 * 画一帧主场景（不含 overlay 与粒子）。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param view - 视图参数。
 */
export function renderMolecule(ctx: CanvasRenderingContext2D, state: MoleculeState, view: MoleculeView): void {
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  const def = state.def
  hudPair(ctx, 14, 22, '关卡 ', (state.levelIndex + 1) + '/5 · ' + def.name + ' ' + def.display)
  hudPair(ctx, LOGICAL_W - 14, 22, '步数 ', state.moves + ' / 参考 ' + state.par, 'right', THEME.gold)

  // 目标面板第二行：元素达成 chips（该元素全部原子价饱和则点亮）。
  let chipX = 14
  for (const el of ['H', 'C', 'N', 'O'] as const) {
    const need = state.target[el] ?? 0
    if (need <= 0) continue
    const sat = state.atoms.filter(a => a.el === el).every(a => freeBonds(a) === 0)
    const style = ELEMENT_STYLE[el]!
    ctx.globalAlpha = sat ? 1 : 0.55
    ctx.fillStyle = style.fill
    if (sat) glow(ctx, style.tick, 8)
    roundRectPath(ctx, chipX, 36, 22 + String(need).length * 8 + 14, 18, 9)
    ctx.fill()
    noGlow(ctx)
    ctx.beginPath()
    ctx.arc(chipX + 11, 45, 5, 0, Math.PI * 2)
    ctx.fillStyle = sat ? style.tick : THEME.panelEdge
    ctx.fill()
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = sat ? THEME.text : THEME.textMuted
    ctx.fillText(el + '×' + need, chipX + 20, 49)
    ctx.globalAlpha = 1
    chipX += 22 + String(need).length * 8 + 22
  }

  const { ox, ny } = boardOrigin(state)
  // 网格暗纹（空格）与墙块。
  for (let r = 0; r < state.rows; r += 1) {
    for (let c = 0; c < state.cols; c += 1) {
      const x = ox + c * CELL
      const y = ny + r * CELL
      if (state.walls[r]![c]!) {
        ctx.fillStyle = THEME.panel
        roundRectPath(ctx, x + 1, y + 1, CELL - 2, CELL - 2, 6)
        ctx.fill()
        ctx.strokeStyle = THEME.panelEdge
        ctx.lineWidth = 1
        ctx.stroke()
      } else {
        ctx.strokeStyle = 'rgba(122,162,247,0.10)'
        ctx.lineWidth = 1
        roundRectPath(ctx, x + 3, y + 3, CELL - 6, CELL - 6, 6)
        ctx.stroke()
      }
    }
  }

  const t = view.push === null ? 1 : ease(Math.min(1, Math.max(0, view.push.t)))
  const posOf = (atom: Atom): { x: number; y: number } => {
    if (view.push === null) return atomCenter(state, atom)
    for (const m of view.push.moved) {
      if (m.id !== atom.id) continue
      const from = cellCenter(state, m.from.r, m.from.c)
      const to = cellCenter(state, m.to.r, m.to.c)
      return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
    }
    return atomCenter(state, atom)
  }

  // 键连线：单键一线、双键双平行线，画在原子下层。
  for (const a of state.atoms) {
    for (const k of Object.keys(a.bonds).map(Number)) {
      if (k < a.id) continue
      const b = atomById(state, k)
      const pa = posOf(a)
      const pb = posOf(b)
      const order = Math.min(MAX_BOND_ORDER, a.bonds[k]!)
      ctx.strokeStyle = 'rgba(226,226,238,0.65)'
      ctx.lineWidth = 2.5
      const dx = pb.x - pa.x
      const dy = pb.y - pa.y
      const len = Math.hypot(dx, dy)
      if (len <= 0) continue
      const nx = -dy / len
      const nyv = dx / len
      for (let i = 0; i < order; i += 1) {
        const off = order === 1 ? 0 : (i === 0 ? -3.2 : 3.2)
        ctx.beginPath()
        ctx.moveTo(pa.x + nx * off, pa.y + nyv * off)
        ctx.lineTo(pb.x + nx * off, pb.y + nyv * off)
        ctx.stroke()
      }
    }
  }

  // 原子球：seed 确定的绘制顺序，符号 + 空价刻痕 + 主原子高亮。
  const R = CELL * 0.36
  for (const id of shimmerOrder(state)) {
    const a = atomById(state, id)
    const style = ELEMENT_STYLE[a.el]!
    const p = posOf(a)
    const isMain = a.id === state.mainId
    if (isMain) glow(ctx, THEME.text, 14)
    ctx.fillStyle = style.fill
    ctx.beginPath()
    ctx.arc(p.x, p.y, R, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    ctx.strokeStyle = isMain ? THEME.text : style.tick
    ctx.lineWidth = isMain ? 2 : 1.4
    ctx.beginPath()
    ctx.arc(p.x, p.y, R, 0, Math.PI * 2)
    ctx.stroke()
    if (isMain) {
      ctx.strokeStyle = 'rgba(226,226,238,0.45)'
      ctx.lineWidth = 1.2
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.arc(p.x, p.y, R + 6 + Math.sin(view.timeMs / 300) * 1.5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
    // 剩余空价刻痕：按化合价槽位均匀分布。
    const free = freeBonds(a)
    const val = VALENCE[a.el]
    for (let i = 0; i < val; i += 1) {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / val
      const filled = i < free
      const r0 = R + 2
      const r1 = filled ? R + 8 : R + 5
      ctx.strokeStyle = filled ? style.tick : 'rgba(226,226,238,0.18)'
      ctx.lineWidth = filled ? 2.4 : 1.4
      ctx.beginPath()
      ctx.moveTo(p.x + Math.cos(angle) * r0, p.y + Math.sin(angle) * r0)
      ctx.lineTo(p.x + Math.cos(angle) * r1, p.y + Math.sin(angle) * r1)
      ctx.stroke()
    }
    ctx.font = 'bold 15px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = style.text
    ctx.fillText(a.el, p.x, p.y + 1)
    ctx.textBaseline = 'alphabetic'
  }

  // 底部提示结构。
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('提示结构 ' + def.hint, LOGICAL_W / 2, LOGICAL_H - 10)
}

/**
 * 画过关/暂停 overlay。过关时按最终键合几何缩放展示分子结构小图。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param kind - 'won'（含最后一关全通意味，由调用方决定文案）或 'paused'。
 */
export function renderMoleculeOverlay(ctx: CanvasRenderingContext2D, state: MoleculeState, kind: 'won' | 'paused'): void {
  if (kind === 'paused') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', '按 P 继续 · R 重开', THEME.text)
    return
  }
  const sub = state.def.name + ' ' + state.def.display + ' · ' + structureString(state)
    + ' · ' + state.moves + ' 步（参考 ' + state.par + '）'
  drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '过关', sub, THEME.good)
  // 分子结构小图：以质心为原点，按最终网格相对位置缩放绘制。
  let cx = 0
  let cy = 0
  for (const a of state.atoms) { cx += a.c; cy += a.r }
  cx /= state.atoms.length
  cy /= state.atoms.length
  let span = 1
  for (const a of state.atoms) span = Math.max(span, Math.abs(a.c - cx), Math.abs(a.r - cy))
  const scale = Math.min(40, 70 / span)
  const px = (a: Atom): { x: number; y: number } => ({
    x: LOGICAL_W / 2 + (a.c - cx) * scale * 2,
    y: LOGICAL_H / 2 + 72 + (a.r - cy) * scale * 2,
  })
  for (const a of state.atoms) {
    for (const k of Object.keys(a.bonds).map(Number)) {
      if (k < a.id) continue
      const pa = px(a)
      const pb = px(atomById(state, k))
      const order = a.bonds[k]!
      ctx.strokeStyle = 'rgba(226,226,238,0.75)'
      ctx.lineWidth = 2
      const dx = pb.x - pa.x
      const dy = pb.y - pa.y
      const len = Math.hypot(dx, dy)
      if (len <= 0) continue
      const nx = -dy / len
      const nyv = dx / len
      for (let i = 0; i < order; i += 1) {
        const off = order === 1 ? 0 : (i === 0 ? -2.6 : 2.6)
        ctx.beginPath()
        ctx.moveTo(pa.x + nx * off, pa.y + nyv * off)
        ctx.lineTo(pb.x + nx * off, pb.y + nyv * off)
        ctx.stroke()
      }
    }
  }
  for (const a of state.atoms) {
    const style = ELEMENT_STYLE[a.el]!
    const p = px(a)
    glow(ctx, style.tick, 8)
    ctx.fillStyle = style.fill
    ctx.beginPath()
    ctx.arc(p.x, p.y, 14, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
    ctx.font = 'bold 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = style.text
    ctx.fillText(a.el, p.x, p.y + 1)
    ctx.textBaseline = 'alphabetic'
  }
}
