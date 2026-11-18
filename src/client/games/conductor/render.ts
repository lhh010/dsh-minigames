/**
 * 列车调度渲染层：轨道线网（道岔当前方向的出边亮金色指示、另一向暗
 * 淡，道岔节点带 A/B 字母与临车呼吸预警）、彩色站台（色框 + 色牌 +
 * 停靠列车）、车库、各色列车（车厢 + 车轮 + 烟囱冒烟，烟羽由 t 确定
 * 性驱动）、顶部时限进度条、分数 / 关号 / 剩余时间 / 失误 HUD、事件
 * 粒子（到站 / 错色 / 相撞）、暂停与终局遮罩。无状态：只读逻辑态。
 */
import {
  W, H, LEVELS, MAX_MISTAKES,
  trainXY, type ConductorState, type CondTrain,
} from './logic.ts'
import {
  THEME, accent, createParticles, drawBackground, drawOverlay, glow, hudPair, noGlow, roundRectPath,
} from '../theme.ts'

/** 渲染层自有的粒子系统（每个画布一个实例）。 */
const particles = createParticles()

/**
 * 节点是否为当前道岔方向的出边终点方向被选中的那条边。
 * @param state - 当前状态。
 * @param edgeId - 边 id。
 * @returns 该边是否为其起点道岔的当前方向。
 */
function isActiveExit(state: ConductorState, edgeId: number): boolean {
  const e = state.edges[edgeId]!
  const from = state.nodes[e.from]!
  return from.kind === 'junction' && from.out[state.switches[from.id] === 1 ? 1 : 0] === edgeId
}

/**
 * 画轨道：主干与岔道双层描边；道岔被选中的出边亮金色，未选中的岔道
 * 半透明；普通轨道用面板色。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawTracks(ctx: CanvasRenderingContext2D, state: ConductorState): void {
  ctx.lineCap = 'round'
  for (const e of state.edges) {
    const a = state.nodes[e.from]!
    const b = state.nodes[e.to]!
    ctx.lineWidth = 7
    ctx.strokeStyle = 'rgba(226,226,238,0.10)'
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    ctx.lineWidth = 3
    ctx.strokeStyle = e.trunk ? '#4a4a68' : 'rgba(226,226,238,0.28)'
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  // 道岔当前方向：亮金描边 + 微光。
  for (const jid of state.junctionIds) {
    const j = state.nodes[jid]!
    const eid = j.out[state.switches[jid] === 1 ? 1 : 0]!
    const e = state.edges[eid]!
    const b = state.nodes[e.to]!
    glow(ctx, THEME.gold, 8)
    ctx.lineWidth = 4
    ctx.strokeStyle = THEME.gold
    ctx.beginPath()
    ctx.moveTo(j.x, j.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    noGlow(ctx)
  }
}

/**
 * 画道岔节点：圆环 + 当前方向字母；有列车正在逼近（<130px）时呼吸
 * 预警放大。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawSwitches(ctx: CanvasRenderingContext2D, state: ConductorState): void {
  for (const jid of state.junctionIds) {
    const j = state.nodes[jid]!
    let near = Infinity
    for (const tr of state.trains) {
      if (tr.state !== 'running') continue
      const p = trainXY(state, tr)
      near = Math.min(near, Math.hypot(p.x - j.x, p.y - j.y))
    }
    const hot = near < 130
    const r = hot ? 11 : 9
    ctx.fillStyle = THEME.bgTop
    ctx.beginPath()
    ctx.arc(j.x, j.y, r, 0, Math.PI * 2)
    ctx.fill()
    if (hot) glow(ctx, THEME.gold, 12)
    ctx.lineWidth = 3
    ctx.strokeStyle = hot ? THEME.gold : THEME.panelEdge
    ctx.beginPath()
    ctx.arc(j.x, j.y, r, 0, Math.PI * 2)
    ctx.stroke()
    noGlow(ctx)
    ctx.font = 'bold 10px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = hot ? THEME.gold : THEME.textMuted
    ctx.fillText(state.switches[jid] === 1 ? 'B' : 'A', j.x, j.y + 0.5)
    ctx.textBaseline = 'alphabetic'
  }
}

/**
 * 画站台：色框小站台 + 内嵌色牌；已停靠列车画在站台上并发光。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawStations(ctx: CanvasRenderingContext2D, state: ConductorState): void {
  for (const n of state.nodes) {
    if (n.kind !== 'station') continue
    const color = accent(n.color)
    const docked = state.trains.some((tr) => tr.state === 'docked' && tr.station === n.id)
    const w = 52
    const h = 20
    if (docked) glow(ctx, color, 10)
    roundRectPath(ctx, n.x - w / 2, n.y - h / 2, w, h, 6)
    ctx.fillStyle = THEME.panel
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = color
    ctx.stroke()
    noGlow(ctx)
    // 色牌。
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(n.x - w / 2 + 10, n.y, 4.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = '600 10px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = docked ? color : THEME.textMuted
    ctx.fillText(docked ? '已停靠' : '站台', n.x - w / 2 + 18, n.y + 3.5)
  }
}

/**
 * 画车库（发车点）与待发列车数。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawDepot(ctx: CanvasRenderingContext2D, state: ConductorState): void {
  const n = state.nodes[state.sourceId]!
  roundRectPath(ctx, n.x - 22, n.y - 14, 40, 28, 5)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = THEME.panelEdge
  ctx.stroke()
  ctx.font = '600 10px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('车库', n.x - 2, n.y + 3.5)
  const waiting = state.trains.filter((tr) => tr.state === 'waiting').length
  if (waiting > 0) {
    ctx.fillStyle = THEME.text
    ctx.fillText('×' + waiting, n.x + 28, n.y + 3.5)
  }
}

/**
 * 画一列行驶中的火车：按航向角旋转的车厢 + 驾驶室 + 烟囱 + 车轮 +
 * 确定性烟羽（由 t 驱动的三个渐隐烟团）。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param train - 目标列车。
 */
function drawTrain(ctx: CanvasRenderingContext2D, state: ConductorState, train: CondTrain): void {
  const p = trainXY(state, train)
  const color = accent(train.color)
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(p.angle)
  // 烟羽：三个烟团循环后飘，相位完全由 t 决定。
  for (let k = 0; k < 3; k += 1) {
    const phase = ((state.t + k * 260) % 780) / 780
    ctx.globalAlpha = (1 - phase) * 0.35
    ctx.fillStyle = THEME.text
    ctx.beginPath()
    ctx.arc(-16 - phase * 16, -8 - phase * 8, 2 + phase * 3.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  // 车厢。
  glow(ctx, color, 7)
  roundRectPath(ctx, -14, -8, 28, 15, 4)
  ctx.fillStyle = color
  ctx.fill()
  noGlow(ctx)
  // 驾驶室与烟囱。
  ctx.fillStyle = 'rgba(13,13,20,0.55)'
  roundRectPath(ctx, 2, -6, 9, 8, 2)
  ctx.fill()
  ctx.fillRect(-13, -10, 4, 4)
  // 车轮。
  ctx.fillStyle = '#0c0c14'
  for (const wx of [-8, 0, 8]) {
    ctx.beginPath()
    ctx.arc(wx, 8, 3, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/**
 * 消费逻辑事件生成粒子（每帧消费一次，step 会重新填充）。
 * @param state - 当前状态。
 */
function burstEvents(state: ConductorState): void {
  for (const ev of state.events) {
    if (ev.type === 'dock' || ev.type === 'wrong') {
      const n = state.nodes[ev.node]!
      particles.burst(n.x, n.y, accent(ev.color), ev.type === 'dock' ? 14 : 8, 120)
    } else if (ev.type === 'crash') {
      particles.burst(ev.x, ev.y, THEME.bad, 24, 190)
    } else if (ev.type === 'clear') {
      particles.burst(W / 2, H / 2, THEME.gold, 20, 160)
    }
  }
  state.events.length = 0
}

/**
 * 画 HUD：顶部时限进度条（金色，末 5 秒变红）、分数、关号、剩余时间、
 * 失误圆点。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
function drawHud(ctx: CanvasRenderingContext2D, state: ConductorState): void {
  const remain = Math.max(0, state.timeLimit - state.t)
  const frac = Math.max(0, Math.min(1, remain / state.timeLimit))
  const danger = remain < 5000
  ctx.fillStyle = 'rgba(226,226,238,0.10)'
  ctx.fillRect(16, 10, W - 32, 4)
  ctx.fillStyle = danger ? THEME.bad : THEME.gold
  ctx.fillRect(16, 10, (W - 32) * frac, 4)
  hudPair(ctx, 16, 36, '分数', String(state.score))
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = THEME.text
  ctx.fillText('第 ' + state.level + ' / ' + LEVELS.length + ' 关', W / 2, 36)
  hudPair(ctx, W - 16, 36, '时间', (remain / 1000).toFixed(1) + 's', 'right', danger ? THEME.bad : THEME.text)
  // 失误圆点。
  for (let i = 0; i < MAX_MISTAKES; i += 1) {
    ctx.beginPath()
    ctx.arc(W / 2 - 66 + i * 16, 52, 4.5, 0, Math.PI * 2)
    if (i < state.mistakes) {
      ctx.fillStyle = THEME.bad
      ctx.fill()
    } else {
      ctx.lineWidth = 1.5
      ctx.strokeStyle = 'rgba(247,118,142,0.4)'
      ctx.stroke()
    }
  }
}

/**
 * 渲染整帧。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否暂停（叠加暂停遮罩）。
 * @param dtMs - 本帧毫秒（粒子推进用）。
 */
export function renderConductor(ctx: CanvasRenderingContext2D, state: ConductorState, paused: boolean, dtMs = 16): void {
  drawBackground(ctx, W, H)
  drawTracks(ctx, state)
  drawStations(ctx, state)
  drawDepot(ctx, state)
  drawSwitches(ctx, state)
  for (const tr of state.trains) {
    if (tr.state === 'running') drawTrain(ctx, state, tr)
  }
  burstEvents(state)
  particles.tick(ctx, dtMs)
  drawHud(ctx, state)
  if (paused) {
    drawOverlay(ctx, W, H, '暂停', '按 P 继续 · R 重开')
    return
  }
  if (state.status === 'cleared') {
    drawOverlay(ctx, W, H, '准点到站', '第 ' + state.level + ' 关完成', THEME.good)
  } else if (state.status === 'won') {
    drawOverlay(ctx, W, H, '全部准点', '总分 ' + state.score, THEME.gold)
  } else if (state.status === 'lost') {
    const why = state.lostReason === 'crash' ? '两列火车相撞了' : state.lostReason === 'mistakes' ? '失误达 ' + MAX_MISTAKES + ' 次' : '时间耗尽'
    drawOverlay(ctx, W, H, '调度失败', why + ' · 按 R 重开', THEME.bad)
  }
}
