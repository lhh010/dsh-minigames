/**
 * 套圈达人（Ring Toss）渲染：夜市嘉年华摊位（灯串背景、木质柜台）、
 * 分值立柱（近/中/金三色 + 分值牌）、圆环抛物线飞行（自转）、套中滑落
 * 展示、蓄力条、HUD（环数/轮次/连击/分数）与轮次/暂停/结束 overlay。纯
 * canvas 绘制，无 DOM、无状态（粒子系统由 index 持有并叠加在本层之上）。
 */
import { THEME, accent, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath } from '../theme.ts'
import {
  COMBO_CAP, FLOOR_Y, HAND, RINGS_PER_ROUND, ROUNDS,
  RING_R, W, H, type Peg, type RingTossState,
} from './logic.ts'

/** 立柱三档配色：近柱绿、中柱蓝、金柱金。 */
const PEG_COLORS = ["#9ece6a", "#7aa2f7", "#e0af68"]

/**
 * 画一串灯：沿正弦下垂的电线挂发光灯泡。
 * @param ctx - 画布上下文。
 * @param y0 - 电线起点 y。
 * @param phase - 相位错开（多串灯用）。
 */
function drawLights(ctx: CanvasRenderingContext2D, y0: number, phase: number): void {
  ctx.strokeStyle = "rgba(226,226,238,0.18)"
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= W; x += 8) {
    const y = y0 + Math.sin((x / W) * Math.PI) * 26
    if (x === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  for (let i = 0; i <= 10; i += 1) {
    const x = (i / 10) * W
    const y = y0 + Math.sin((x / W) * Math.PI) * 26 + 5
    const color = accent(i + phase)
    glow(ctx, color, 8)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fill()
    noGlow(ctx)
  }
}

/**
 * 画一根立柱：柱身、柱顶圆头与分值牌。
 * @param ctx - 画布上下文。
 * @param peg - 立柱数据。
 */
function drawPeg(ctx: CanvasRenderingContext2D, peg: Peg): void {
  const color = PEG_COLORS[peg.tier]!
  ctx.strokeStyle = "rgba(226,226,238,0.25)"
  ctx.lineWidth = 8
  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.moveTo(peg.x, FLOOR_Y + 3)
  ctx.lineTo(peg.x, peg.topY + 4)
  ctx.stroke()
  ctx.strokeStyle = color
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(peg.x, FLOOR_Y + 2)
  ctx.lineTo(peg.x, peg.topY + 3)
  ctx.stroke()
  glow(ctx, color, 7)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(peg.x, peg.topY, 6, 0, Math.PI * 2)
  ctx.fill()
  noGlow(ctx)
  // 分值牌。
  const bw = 30, bh = 16
  roundRectPath(ctx, peg.x - bw / 2, peg.topY - bh - 10, bw, bh, 5)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.font = "700 10px system-ui, sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = color
  ctx.fillText(String(peg.value), peg.x, peg.topY - bh / 2 - 10)
  ctx.textBaseline = "alphabetic"
}

/**
 * 画圆环（侧视为旋转椭圆；sliding 为套中后沿柱滑落的 y 偏移）。
 * @param ctx - 画布上下文。
 * @param x - 环心 x。
 * @param y - 环心 y。
 * @param rot - 自转角 rad。
 * @param color - 环色。
 * @param ry - 纵向半径（透视压扁用）。
 */
function drawRingShape(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, color: string, ry: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot * 0.4)
  glow(ctx, color, 8)
  ctx.strokeStyle = color
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.ellipse(0, 0, RING_R + 2, ry, 0, 0, Math.PI * 2)
  ctx.stroke()
  noGlow(ctx)
  ctx.restore()
}

/**
 * 渲染一帧完整场景。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param paused - 暂停遮罩开关。
 */
export function renderRingToss(ctx: CanvasRenderingContext2D, state: RingTossState, paused: boolean): void {
  drawBackground(ctx, W, H)
  drawLights(ctx, 26, 0)
  drawLights(ctx, 54, 3)

  // 摊位柜台。
  ctx.fillStyle = THEME.panel
  roundRectPath(ctx, 0, FLOOR_Y, W, H - FLOOR_Y, 0)
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, FLOOR_Y)
  ctx.lineTo(W, FLOOR_Y)
  ctx.stroke()

  for (const peg of state.pegs) drawPeg(ctx, peg)

  // 风向指示（第 2 轮起有风时）。
  if (state.wind !== 0 && state.phase !== "over") {
    const dir = Math.sign(state.wind)
    const len = Math.abs(state.wind) / 150 * 26
    ctx.strokeStyle = accent(5)
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(W / 2 - dir * len, 92)
    ctx.lineTo(W / 2 + dir * len, 92)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(W / 2 + dir * len, 92)
    ctx.lineTo(W / 2 + dir * (len - 7), 87)
    ctx.moveTo(W / 2 + dir * len, 92)
    ctx.lineTo(W / 2 + dir * (len - 7), 97)
    ctx.stroke()
    ctx.font = "600 11px system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.fillStyle = THEME.textMuted
    ctx.fillText("风", W / 2, 82)
  }

  // 圆环：待投/蓄力在手上，飞行中按轨迹，套中后沿柱滑落。
  const ringColor = accent(4)
  if (state.phase === "aim" || state.phase === "charge") {
    drawRingShape(ctx, HAND.x, HAND.y, 0, ringColor, 10)
    // 手持杆示意。
    ctx.strokeStyle = "rgba(226,226,238,0.4)"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(HAND.x - 22, FLOOR_Y)
    ctx.lineTo(HAND.x - 6, HAND.y + 14)
    ctx.stroke()
    if (state.phase === "charge") {
      // 蓄力条：出手点下方，力度按比例增长，接近满力转暖色。
      const bw = 120, bh = 10
      const bx = HAND.x - bw / 2, by = HAND.y + 26
      roundRectPath(ctx, bx, by, bw, bh, 5)
      ctx.fillStyle = "rgba(13,13,20,0.6)"
      ctx.fill()
      const frac = state.power
      if (frac > 0) {
        roundRectPath(ctx, bx + 1, by + 1, Math.max(4, (bw - 2) * frac), bh - 2, 4)
        ctx.fillStyle = frac > 0.8 ? THEME.bad : frac > 0.55 ? THEME.gold : THEME.good
        ctx.fill()
      }
      ctx.font = "600 11px system-ui, sans-serif"
      ctx.textAlign = "center"
      ctx.fillStyle = THEME.textMuted
      ctx.fillText("力度 " + Math.round(state.power * 100) + "%", HAND.x, by + 26)
    }
  } else if (state.phase === "flying") {
    drawRingShape(ctx, state.ring.x, state.ring.y, state.ring.rot, ringColor, 12)
  } else if (state.phase === "settle" && state.slide !== null) {
    const peg = state.pegs[state.slide.pegIndex]
    if (peg !== undefined) {
      const prog = Math.min(1, state.slide.t / 600)
      const y = peg.topY + prog * (FLOOR_Y - peg.topY - 14)
      drawRingShape(ctx, peg.x, y, 0, ringColor, 9)
    }
  }

  // 飘字。
  for (const fl of state.floats) {
    ctx.globalAlpha = Math.max(0, Math.min(1, fl.life / 950))
    ctx.font = "bold 16px system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.fillStyle = fl.color
    ctx.fillText(fl.text, fl.x, fl.y)
  }
  ctx.globalAlpha = 1

  // HUD：环数 / 轮次 / 连击 + 分数。
  ctx.textAlign = "left"
  hudPair(ctx, 14, 24, "环", String(state.ringsLeft) + "/" + RINGS_PER_ROUND)
  hudPair(ctx, 110, 24, "轮", String(state.round) + "/" + ROUNDS)
  hudPair(ctx, 200, 24, "连击", state.combo >= 2 ? "x" + Math.min(state.combo, COMBO_CAP) : "-", "left", state.combo >= 2 ? THEME.gold : THEME.textMuted)
  hudPair(ctx, W - 14, 24, "分数", String(state.score), "right")

  if (state.phase === "over") {
    drawOverlay(ctx, W, H, "游戏结束", "本局 " + state.score + " 分 · 按 R 再来一局")
  } else if (paused) {
    drawOverlay(ctx, W, H, "暂停", "按 P 继续 · 按 R 重开")
  } else if (state.phase === "settle" && state.ringsThrown >= RINGS_PER_ROUND) {
    drawOverlay(ctx, W, H, state.round < ROUNDS ? "第 " + (state.round + 1) + " 轮" : "最后一环", state.round < ROUNDS ? "柱位即将重排" + (state.round + 1 >= 2 ? " · 风起" : "") : "结算中…", accent(2))
  }
}
