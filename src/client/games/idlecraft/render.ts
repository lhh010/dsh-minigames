/**
 * 小作坊 IdleCraft 渲染层：工厂风——左侧大齿轮敲打按钮（按压缩放动画 +
 * 缓转）、右侧五级机器卡片流水排列（卡片齿轮按产量级速旋转）、总产出 /
 * 剩余时间大字 HUD、里程碑进度条、飘字与滚动数字，以及带产出曲线小图的
 * 结算 overlay。纯 canvas 绘制，无随机源（飘字横向偏移按序号取模）。
 *
 * UI 矩形与锚点核算（LOGICAL 720×480，两两不相交且不越界）：
 * - 顶部 HUD：左「总产出」标签 13px 左锚 (16,26)，数值 26px 左锚 (16,54)，
 *   数值最大 7 位 ≈146px，右边界 162 < 进度条上沿以下区域不冲突；
 *   右「剩余」标签 13px 右锚 (704,26)，数值 26px 右锚 (704,54)。
 * - 里程碑进度条 [16,64]-[420,78]；里程碑文字 11px 左锚 (428,76) ≈66px 宽
 *   → 右缘 494；冲刺徽章 13px 右锚 (704,76) ≈84px 宽 → 左缘 620 > 494。
 * - 齿轮按钮圆心 (104,250) r=62 → 矩形 [42,166]×[188,312]；
 *   「空格/点击」12px 居中锚 (104,342)；「⚙ 余额」16px 居中锚 (104,372)，
 *   x 范围 ≤166 < 卡片区左缘 200。
 * - 机器卡片区 [200,96]-[704,396]：5 张卡 h=52 间 10，第 i 张 y=96+62i；
 *   卡内：图标 18px 左锚 (212, y+32)、名称 14px 左锚 (244, y+22)、
 *   产量 12px 左锚 (244, y+42)、价格 14px 右锚 (692, y+24)、
 *   热键/台数 12px 右锚 (692, y+43)——左右两列间 ≥300px 空隙。
 * - U 升级行 13px 左锚 (200,420)（卡片区底 396 之下，速览线之上）。
 * - 底部常驻速览 12px 居中锚 (360,456)。
 * - 结算 overlay：标题 26px 居中 (360,150)、战报 14px 居中 (360,186)、
 *   曲线框 [230,214]-[490,294]、提示 13px 居中 (360,326)。
 */
import { THEME, accent, drawBackground, drawOverlay, glow, noGlow, roundRectPath, spaced } from '../theme.ts'
import { DURATION_MS, LEVELS, MILESTONES, TIERS, UNLOCK_MARKUP, globalMult, isSprint, machinePrice, milestoneProgress, productionPerSec, unlockCost, type IdleCraftState, type TierIndex } from './logic.ts'

/** 逻辑画布尺寸。 */
export const LOGICAL_W = 720
export const LOGICAL_H = 480

/** 齿轮敲打按钮（圆形）的圆心与半径。 */
const BTN_X = 104
const BTN_Y = 250
const BTN_R = 62

/** 机器卡片区几何。 */
const CARD_X = 200
const CARD_W = 504
const CARD_Y0 = 96
const CARD_H = 52
const CARD_GAP = 10

/** 一条飘字。 */
interface FloatText {
  /** 逻辑 x（生成点）。 */
  x: number
  /** 逻辑 y（生成点）。 */
  y: number
  /** 已存活毫秒。 */
  life: number
  /** 显示文本。 */
  text: string
  /** 序号（横向偏移按序取模，避免随机）。 */
  seq: number
}

/** 渲染层动画状态（index 持有并逐帧喂给渲染）。 */
export interface IdleCraftView {
  /** 按压动画剩余毫秒（>0 时按钮缩到 0.92）。 */
  press: number
  /** 滚动显示的总产出（向真值缓动）。 */
  shownTotal: number
  /** 齿轮累计旋转角（毫秒积分）。 */
  spin: number
  /** 飘字池。 */
  floats: FloatText[]
  /** 飘字序号计数。 */
  seq: number
}

/** 创建渲染动画状态。 */
export function createIdleCraftView(): IdleCraftView {
  return { press: 0, shownTotal: 0, spin: 0, floats: [], seq: 0 }
}

/**
 * 生成一条 +N 飘字（敲打/里程碑时调用）。
 * @param view - 渲染动画状态。
 * @param text - 飘字内容。
 */
export function pushFloat(view: IdleCraftView, text: string): void {
  view.seq += 1
  view.floats.push({ x: BTN_X + ((view.seq % 5) - 2) * 14, y: BTN_Y - BTN_R - 8, life: 0, text, seq: view.seq })
  if (view.floats.length > 12) view.floats.shift()
}

/** 大数短格式：≥10000 用 k 一位小数，否则取整。 */
function fmt(n: number): string {
  if (n >= 10000) return (Math.floor(n / 100) / 10).toFixed(1) + 'k'
  return String(Math.floor(n))
}

/** 剩余时间 mm:ss。 */
function fmtTime(msLeft: number): string {
  const s = Math.max(0, Math.ceil(msLeft / 1000))
  const m = Math.floor(s / 60)
  return m + ':' + String(s % 60).padStart(2, '0')
}

/** 画一个齿轮路径（外圈齿 + 中心孔），供按钮与卡片动画共用。 */
function gearPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, teeth: number, rot: number): void {
  ctx.beginPath()
  const inner = r * 0.78
  for (let i = 0; i < teeth; i++) {
    const a0 = rot + (i / teeth) * Math.PI * 2
    const a1 = a0 + (Math.PI * 2 / teeth) * 0.45
    const a2 = a0 + (Math.PI * 2 / teeth) * 0.55
    const a3 = a0 + (Math.PI * 2 / teeth)
    if (i === 0) ctx.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r)
    else ctx.lineTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r)
    ctx.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r)
    ctx.lineTo(cx + Math.cos(a2) * inner, cy + Math.sin(a2) * inner)
    ctx.lineTo(cx + Math.cos(a3) * inner, cy + Math.sin(a3) * inner)
  }
  ctx.closePath()
}

/** 判断逻辑坐标是否落在敲打按钮上。 */
export function hammerHit(x: number, y: number): boolean {
  const dx = x - BTN_X
  const dy = y - BTN_Y
  return dx * dx + dy * dy <= BTN_R * BTN_R
}

/**
 * 渲染一帧。
 * @param ctx - 逻辑坐标系下的 2d 上下文。
 * @param state - 一局状态。
 * @param view - 渲染动画状态（会被推进：缓动、旋转、飘字寿命）。
 * @param dtMs - 本帧毫秒（动画推进用，非逻辑 tick）。
 * @param paused - 暂停中（按钮变灰、提示继续）。
 */
export function renderIdleCraft(ctx: CanvasRenderingContext2D, state: IdleCraftState, view: IdleCraftView, dtMs: number, paused: boolean): void {
  // 动画推进（暂停时冻结旋转与飘字，缓动保留）
  if (!paused) {
    view.spin += dtMs
    view.press = Math.max(0, view.press - dtMs)
    for (let i = view.floats.length - 1; i >= 0; i--) {
      const f = view.floats[i]!
      f.life += dtMs
      if (f.life > 900) view.floats.splice(i, 1)
    }
  }
  view.shownTotal += (state.totalProduced - view.shownTotal) * Math.min(1, dtMs / 160)

  drawBackground(ctx, LOGICAL_W, LOGICAL_H)
  const sprint = isSprint(state)

  // 顶部 HUD：左总产出、右剩余时间（数值右锚，永不越界）
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('总产出', 16, 26)
  ctx.font = 'bold 26px system-ui, sans-serif'
  ctx.fillStyle = THEME.gold
  ctx.fillText(fmt(view.shownTotal), 16, 54)
  ctx.textAlign = 'right'
  ctx.font = '600 13px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('剩余', 704, 26)
  ctx.font = 'bold 26px system-ui, sans-serif'
  ctx.fillStyle = sprint ? THEME.bad : THEME.text
  ctx.fillText(fmtTime(DURATION_MS - state.elapsedMs), 704, 54)

  // 里程碑进度条 [16,64]-[420,78]
  const prog = milestoneProgress(state)
  roundRectPath(ctx, 16, 64, 404, 14, 7)
  ctx.fillStyle = THEME.panel
  ctx.fill()
  ctx.strokeStyle = THEME.panelEdge
  ctx.lineWidth = 1
  ctx.stroke()
  if (prog > 0) {
    roundRectPath(ctx, 18, 66, Math.max(4, 400 * prog), 10, 5)
    ctx.fillStyle = accent(2)
    glow(ctx, accent(2), 6)
    ctx.fill()
    noGlow(ctx)
  }
  ctx.textAlign = 'left'
  ctx.font = '600 11px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('里程碑 ' + state.milestones + '/4', 428, 76)
  if (sprint) {
    ctx.textAlign = 'right'
    ctx.font = 'bold 13px system-ui, sans-serif'
    ctx.fillStyle = THEME.bad
    ctx.fillText('冲刺 ×1.5！', 704, 76)
  }

  // 敲打大齿轮按钮（圆心 104,250 r=62；按压缩到 0.92）
  const scale = view.press > 0 ? 0.92 : 1
  const btnColor = paused ? THEME.textMuted : accent(0)
  glow(ctx, btnColor, 14)
  gearPath(ctx, BTN_X, BTN_Y, BTN_R * scale, 10, view.spin / 2600)
  ctx.fillStyle = paused ? THEME.panel : '#2a3a5e'
  ctx.fill()
  noGlow(ctx)
  gearPath(ctx, BTN_X, BTN_Y, BTN_R * 0.42 * scale, 8, -view.spin / 1800)
  ctx.fillStyle = btnColor
  ctx.fill()
  ctx.textAlign = 'center'
  ctx.font = 'bold 20px system-ui, sans-serif'
  ctx.fillStyle = THEME.text
  ctx.fillText('敲 打', BTN_X, BTN_Y + 7)
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('空格 / 点击', BTN_X, 342)
  ctx.font = 'bold 16px system-ui, sans-serif'
  ctx.fillStyle = THEME.gold
  ctx.fillText('⚙ ' + fmt(state.gears), BTN_X, 372)

  // 机器卡片流水排列（5 张，锁定态变暗）
  for (let i = 0; i < 5; i++) {
    const tier = i as TierIndex
    const y = CARD_Y0 + i * (CARD_H + CARD_GAP)
    const locked = tier > state.unlockedTier
    const color = accent(i)
    roundRectPath(ctx, CARD_X, y, CARD_W, CARD_H, 8)
    ctx.fillStyle = locked ? 'rgba(30,30,42,0.6)' : THEME.panel
    ctx.fill()
    ctx.strokeStyle = locked ? THEME.panelEdge : color
    ctx.lineWidth = locked ? 1 : 1.5
    if (!locked && state.machines[tier] > 0) glow(ctx, color, 5)
    ctx.stroke()
    noGlow(ctx)
    // 卡片小齿轮：台数越多转越快
    const count = state.machines[tier]
    const spin = view.spin / Math.max(500, 6000 / (1 + count)) * (count > 0 ? 1 : 0.15)
    gearPath(ctx, 226, y + CARD_H / 2, 14, 8, spin)
    ctx.fillStyle = locked ? THEME.panelEdge : color
    ctx.globalAlpha = locked ? 0.5 : 1
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.textAlign = 'left'
    ctx.font = 'bold 14px system-ui, sans-serif'
    ctx.fillStyle = locked ? THEME.textMuted : THEME.text
    ctx.fillText(TIERS[tier]!.name, 252, y + 22)
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    const each = TIERS[tier]!.ratePerSec * globalMult(state)
    ctx.fillText('单台 ' + each + '/s × ' + count + ' 台', 252, y + 42)
    ctx.textAlign = 'right'
    if (locked) {
      ctx.font = 'bold 13px system-ui, sans-serif'
      ctx.fillStyle = THEME.textMuted
      ctx.fillText('🔒 总产出 ' + MILESTONES[tier] + ' 解锁', 692, y + 24)
      ctx.font = '600 12px system-ui, sans-serif'
      ctx.fillText('或 U 提前（' + fmt(unlockCostIfLocked(tier)) + '）', 692, y + 43)
    } else {
      ctx.font = 'bold 14px system-ui, sans-serif'
      ctx.fillStyle = state.gears >= machinePrice(state, tier) ? THEME.good : THEME.bad
      ctx.fillText('⚙ ' + fmt(machinePrice(state, tier)), 692, y + 24)
      ctx.font = '600 12px system-ui, sans-serif'
      ctx.fillStyle = THEME.textMuted
      ctx.fillText('按 ' + (i + 1) + ' 购买', 692, y + 43)
    }
  }

  // U 升级行（满级后显示现状）
  ctx.textAlign = 'left'
  ctx.font = '600 13px system-ui, sans-serif'
  if (state.unlockedTier >= 4) {
    ctx.fillStyle = THEME.textMuted
    ctx.fillText('全部机器链已解锁，全局倍率 ×' + globalMult(state), 200, 420)
  } else {
    const cost = unlockCost(state)
    ctx.fillStyle = state.gears >= cost ? THEME.good : THEME.textMuted
    ctx.fillText('U 升级：解锁' + TIERS[state.unlockedTier + 1]!.name + '（' + fmt(cost) + '），全局 ×2', 200, 420)
  }

  // 每秒产量提示 + 底部常驻速览
  ctx.fillStyle = THEME.textMuted
  ctx.fillText('自动产量 ' + productionPerSec(state).toFixed(1) + '/s', 200, 440)
  ctx.textAlign = 'center'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.fillText('空格=敲打 · 1-5=买机器 · U=升级 · P=暂停 · R=重开', 360, 456)

  // 飘字（生成于按钮上方，向上漂移淡出）
  for (const f of view.floats) {
    const a = 1 - f.life / 900
    ctx.globalAlpha = a
    ctx.textAlign = 'center'
    ctx.font = 'bold 15px system-ui, sans-serif'
    ctx.fillStyle = THEME.gold
    ctx.fillText(f.text, f.x, f.y - f.life / 16)
    ctx.globalAlpha = 1
  }

  if (paused && state.phase === 'playing') {
    drawOverlay(ctx, LOGICAL_W, LOGICAL_H, '暂 停', 'P 继续 · R 重开（暂停即停表）')
    return
  }
  if (state.phase !== 'playing') {
    const won = state.phase === 'won'
    const level = LEVELS[state.levelIndex]
    ctx.fillStyle = 'rgba(13,13,20,0.8)'
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H)
    ctx.textAlign = 'center'
    ctx.font = 'bold 26px system-ui, sans-serif'
    ctx.fillStyle = won ? THEME.good : THEME.bad
    ctx.fillText(spaced(won ? '大 工 告 成' : '时 间 到'), 360, 150)
    ctx.font = '600 14px system-ui, sans-serif'
    ctx.fillStyle = THEME.text
    ctx.fillText('总产出 ' + fmt(state.totalProduced) + ' / 目标 ' + fmt(level!.target) + '（第 ' + (state.levelIndex + 1) + '/5 局）', 360, 186)
    // 产出曲线小图 [230,214]-[490,294]
    roundRectPath(ctx, 230, 214, 260, 80, 6)
    ctx.fillStyle = THEME.panel
    ctx.fill()
    ctx.strokeStyle = THEME.panelEdge
    ctx.stroke()
    const hist = state.history
    if (hist.length >= 2) {
      const max = hist[hist.length - 1]!
      ctx.beginPath()
      for (let i = 0; i < hist.length; i++) {
        const px = 236 + (i / (hist.length - 1)) * 248
        const py = 288 - (hist[i]! / max) * 68
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.strokeStyle = THEME.gold
      ctx.lineWidth = 2
      glow(ctx, THEME.gold, 4)
      ctx.stroke()
      noGlow(ctx)
    }
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = THEME.textMuted
    const hasNext = state.levelIndex < LEVELS.length - 1
    ctx.fillText(hasNext ? 'N 下一局 · R 重开本局' : 'R 重开本局', 360, 326)
  }
}

/** 锁定卡的提前解锁费（该级阈值 × 加价系数，与 U 键同口径）。 */
function unlockCostIfLocked(tier: TierIndex): number {
  return Math.ceil(MILESTONES[tier] * UNLOCK_MARKUP)
}
