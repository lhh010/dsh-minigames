/**
 * 百变拼图 Jigsaw 画布渲染：凹陷盘面框 + 网格暗纹、碎片按图案裁切绘制
 * （描边阴影 + 拖拽抬起放大）、托盘区、吸附粒子、块数进度/用时 HUD、
 * 过关/暂停覆盖层。共享 theme 视觉件；无状态（全部输入由视图对象携带）。
 */
import { drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath, THEME } from '../theme.ts'
import {
  boardOrigin, CELL, HUD_H, LOGICAL_H, LOGICAL_W, pieceTint, placedCount,
  TRAY,
  type JigsawPiece, type JigsawState, type PatternScene,
} from './logic.ts'

/** 吸附/提示时迸出的一颗粒子（index 每帧推进，render 只负责绘制）。 */
export interface JigsawSpark {
  /** 当前横坐标。 */
  x: number
  /** 当前纵坐标。 */
  y: number
  /** 横向速度（像素/秒）。 */
  vx: number
  /** 纵向速度（像素/秒，含重力由 index 推进）。 */
  vy: number
  /** 已存活毫秒。 */
  life: number
  /** 总寿命毫秒。 */
  maxLife: number
  /** 颜色。 */
  color: string
}

/** 渲染所需的全部游戏视图状态（index.ts 持有并传入）。 */
export interface JigsawView {
  /** 关卡状态。 */
  state: JigsawState
  /** 本关图案场景（碎片裁切与预览共用）。 */
  scene: PatternScene
  /** 选中的碎片编号（无则 null）。 */
  selected: number | null
  /** 正在拖拽（选中碎片抬起放大）。 */
  dragging: boolean
  /** 活动吸附粒子。 */
  sparks: JigsawSpark[]
  /** 累计总分（HUD 展示与上报共用）。 */
  score: number
  /** 过关待进入下一关。 */
  cleared: boolean
  /** 五关全部完成。 */
  complete: boolean
  /** 暂停（覆盖层）。 */
  paused: boolean
}

/**
 * 把整幅图案场景画进 (x,y,w,h) 矩形：渐变底 + 几何形状 + 噪声斑纹。
 * @param ctx - 画布上下文。
 * @param scene - 图案场景。
 * @param x - 目标矩形左上角 x。@param y - 目标矩形左上角 y。
 * @param w - 宽。@param h - 高。
 */
function drawScene(ctx: CanvasRenderingContext2D, scene: PatternScene, x: number, y: number, w: number, h: number): void {
  const grad = ctx.createLinearGradient(x, y, x, y + h)
  grad.addColorStop(0, scene.baseTop)
  grad.addColorStop(1, scene.baseBottom)
  ctx.fillStyle = grad
  ctx.fillRect(x, y, w, h)
  for (const s of scene.shapes) {
    ctx.globalAlpha = s.alpha
    ctx.fillStyle = s.color
    if (s.kind === 'circle') {
      ctx.beginPath()
      ctx.arc(x + s.fx * w, y + s.fy * h, s.r * w, 0, Math.PI * 2)
      ctx.fill()
    } else if (s.kind === 'square') {
      ctx.fillRect(x + (s.fx - s.r) * w, y + (s.fy - s.r) * h, s.r * 2 * w, s.r * 2 * h)
    } else {
      const cx = x + s.fx * w
      const cy = y + s.fy * h
      const r = s.r * h
      ctx.beginPath()
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r, cy + r)
      ctx.lineTo(cx - r, cy + r)
      ctx.closePath()
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
  for (const sp of scene.speckles) {
    ctx.fillStyle = sp.color
    ctx.beginPath()
    ctx.arc(x + sp.fx * w, y + sp.fy * h, sp.r * w, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * 画一块碎片：旋转档角度 + 图案裁切填充 + 描边；选中/拖拽时抬起放大加影。
 * @param ctx - 画布上下文。
 * @param view - 视图状态。
 * @param piece - 目标碎片。
 * @param lifted - 是否抬起（选中或拖拽）。
 */
function drawPiece(ctx: CanvasRenderingContext2D, view: JigsawView, piece: JigsawPiece, lifted: boolean): void {
  const state = view.state
  const tint = pieceTint(state.seed, piece.row, piece.col)
  ctx.save()
  ctx.translate(piece.x, piece.y)
  ctx.rotate((piece.rot * Math.PI) / 2)
  if (lifted) ctx.scale(1.08, 1.08)
  // 图案裁切：局部坐标 [-CELL/2,CELL/2] 对应该碎片在整图中的格。
  ctx.beginPath()
  ctx.rect(-CELL / 2, -CELL / 2, CELL, CELL)
  ctx.clip()
  ctx.translate(-CELL / 2 - piece.col * CELL, -CELL / 2 - piece.row * CELL)
  drawScene(ctx, view.scene, 0, 0, state.size * CELL, state.size * CELL)
  ctx.restore()
  // 描边与阴影在裁切之外画，保证整圈可见。
  ctx.save()
  ctx.translate(piece.x, piece.y)
  ctx.rotate((piece.rot * Math.PI) / 2)
  if (lifted) ctx.scale(1.08, 1.08)
  ctx.beginPath()
  ctx.rect(-CELL / 2, -CELL / 2, CELL, CELL)
  if (lifted) glow(ctx, tint, 16)
  else if (piece.placed) glow(ctx, THEME.good, 6)
  ctx.fillStyle = 'rgba(0,0,0,0.001)'
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = piece.placed ? THEME.good : lifted ? '#ffffff' : tint
  ctx.lineWidth = piece.placed ? 1 : lifted ? 2 : 1.5
  ctx.stroke()
  ctx.restore()
}

/** 凹陷盘面框：外框 + 内阴影 + 网格暗纹（按本关 size）。 */
function drawBoard(ctx: CanvasRenderingContext2D, view: JigsawView): void {
  const state = view.state
  const o = boardOrigin(state.size)
  const side = state.size * CELL
  ctx.fillStyle = 'rgba(10,10,16,0.55)'
  roundRectPath(ctx, o.x - 6, o.y - 6, side + 12, side + 12, 8)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = 'rgba(13,13,20,0.8)'
  ctx.fillRect(o.x, o.y, side, side)
  ctx.strokeStyle = 'rgba(226,226,238,0.06)'
  ctx.lineWidth = 1
  for (let i = 1; i < state.size; i += 1) {
    ctx.beginPath()
    ctx.moveTo(o.x + i * CELL + 0.5, o.y)
    ctx.lineTo(o.x + i * CELL + 0.5, o.y + side)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(o.x, o.y + i * CELL + 0.5)
    ctx.lineTo(o.x + side, o.y + i * CELL + 0.5)
    ctx.stroke()
  }
}

/** 托盘区：面板底 + 虚线散布范围 + 标签。 */
function drawTray(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = THEME.panel
  glow(ctx, THEME.panelEdge, 6)
  roundRectPath(ctx, TRAY.x, TRAY.y, TRAY.w, TRAY.h, 10)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  roundRectPath(ctx, TRAY.x + 0.5, TRAY.y + 0.5, TRAY.w - 1, TRAY.h - 1, 10)
  ctx.stroke()
  ctx.fillStyle = THEME.textMuted
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('碎片托盘 · 拖到盘面吸附', TRAY.x + 10, TRAY.y + 16)
}

/** 吸附粒子：淡出的小光点。 */
function drawSparks(ctx: CanvasRenderingContext2D, sparks: JigsawSpark[]): void {
  for (const s of sparks) {
    const t = s.life / s.maxLife
    ctx.globalAlpha = 1 - t
    glow(ctx, s.color, 6)
    ctx.fillStyle = s.color
    ctx.beginPath()
    ctx.arc(s.x, s.y, 2.5 * (1 - t) + 0.5, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
  }
  ctx.globalAlpha = 1
}

/** 毫秒 → m:ss 展示。 */
function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const sec = total % 60
  return m + ':' + (sec < 10 ? '0' : '') + sec
}

/**
 * 绘制一帧百变拼图。
 * @param ctx - 画布上下文。
 * @param view - 视图状态（含逻辑状态、图案与粒子）。
 */
export function renderJigsaw(ctx: CanvasRenderingContext2D, view: JigsawView): void {
  const state = view.state
  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H)
  drawBackground(ctx, LOGICAL_W, LOGICAL_H)

  // HUD 条：分数 / 关卡与块数进度 / 用时。
  ctx.fillStyle = THEME.panel
  ctx.fillRect(0, 0, LOGICAL_W, HUD_H)
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, LOGICAL_W - 1, HUD_H - 1)
  hudPair(ctx, 10, 21, '分数 ', String(view.score), 'left', view.score > 0 ? THEME.gold : THEME.text)
  hudPair(ctx, LOGICAL_W / 2 - 30, 21, '块数 ', placedCount(state) + '/' + state.size * state.size, 'left', THEME.good)
  hudPair(ctx, LOGICAL_W - 10, 21, 'L' + state.level + '/5 · 用时 ', formatTime(state.elapsedMs), 'right')

  drawBoard(ctx, view)
  drawTray(ctx)

  // 已吸附的碎片先画（平铺在盘面上），未吸附按 id 顺序，抬起的最后画。
  for (const p of state.pieces) {
    if (p.placed) drawPiece(ctx, view, p, false)
  }
  for (const p of state.pieces) {
    if (!p.placed && p.id !== view.selected) drawPiece(ctx, view, p, false)
  }
  const sel = view.selected === null ? undefined : state.pieces.find((q) => q.id === view.selected)
  if (sel !== undefined && !sel.placed) {
    drawPiece(ctx, view, sel, view.dragging)
    if (state.rotate && sel.rot !== 0) {
      ctx.fillStyle = THEME.textMuted
      ctx.font = '600 11px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('旋转 ' + (sel.rot * 90) + '\u00b0', sel.x, sel.y - CELL / 2 - 22)
    }
  }

  drawSparks(ctx, view.sparks)

  if (view.complete) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '拼图大师！', '总分 ' + view.score + ' · 空格：再来一局', THEME.gold)
  } else if (view.cleared) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '过关！', '本关 ' + formatTime(state.elapsedMs) + ' · 空格：下一关', THEME.good)
  } else if (view.paused) {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '已暂停', 'P：继续 · R：重开', THEME.text)
  }
}

/**
 * 命中测试：返回逻辑坐标 (x, y) 处最上层的未吸附碎片编号，无则 null。
 * @param x - 逻辑横坐标。@param y - 逻辑纵坐标。
 * @param state - 关卡状态。
 */
export function pieceHit(x: number, y: number, state: JigsawState): number | null {
  for (let i = state.pieces.length - 1; i >= 0; i -= 1) {
    const p = state.pieces[i]!
    if (p.placed) continue
    if (Math.abs(x - p.x) <= CELL / 2 + 4 && Math.abs(y - p.y) <= CELL / 2 + 4) return p.id
  }
  return null
}

/**
 * 生成一次吸附粒子（index 在吸附/提示成功时调用）。
 * @param x - 迸发中心 x。@param y - 迸发中心 y。
 * @param count - 粒子数。
 * @param color - 粒子颜色。
 * @returns 新生成的粒子数组。
 */
export function makeSparks(x: number, y: number, count: number, color: string): JigsawSpark[] {
  const sparks: JigsawSpark[] = []
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + 0.35
    const speed = 60 + (i % 3) * 28
    sparks.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      life: 0,
      maxLife: 320 + (i % 4) * 60,
      color,
    })
  }
  return sparks
}
