/**
 * 编程机器人 RoboCode 渲染层：科技风网格盘面、朝向箭头机器人（逐格移动 /
 * 转向旋转 / 跳跃弧线动画）、发光芯片与闸门、尖刺与坑、底部指令面板
 * （点击插入 / 删除、循环配对高亮）、运行进度与步数预算 HUD、过关与
 * 中断 overlay。全部为纯 canvas 绘制；状态由 index.ts 持有并注入
 * RobocodeView，本模块不持有可变状态。
 */
import {
  THEME, accent, glow, noGlow, roundRectPath, drawBackground, drawOverlay, hudPair,
  type ParticleSystem,
} from '../theme.ts'
import {
  CELL_CHIP, CELL_GATE, CELL_PIT, CELL_SPIKE, CELL_WALL,
  type Dir, type RoboLevel, type RunStep, type Token,
} from './logic.ts'

/** 逻辑画布尺寸（720×608，fitCanvas 负责适配宿主）。 */
export const VIEW_W = 720
export const VIEW_H = 608

/** 盘面区域（HUD 之下、指令面板之上）。 */
const BOARD_TOP = 46
const BOARD_BOTTOM = 400
/** 指令面板行坐标。 */
const PALETTE_Y = 410
const PALETTE_H = 40
const SLOTS_Y = 464
const SLOT_W = 44
const SLOT_H = 38
const SLOT_GAP = 6
const SLOTS_PER_ROW = 14
/** 面板按钮定义：token 为点击插入的记号，'clear' 为清空按钮。 */
const PALETTE: ReadonlyArray<{ label: string; token: Token | 'clear' }> = [
  { label: 'F 前进', token: 'F' },
  { label: 'L 左转', token: 'L' },
  { label: 'R 右转', token: 'R' },
  { label: 'J 跳跃', token: 'J' },
  { label: 'F2 两格', token: 'F2' },
  { label: '⟲2 循环', token: { loop: 2 } },
  { label: 'end 结束', token: 'end' },
  { label: '清空', token: 'clear' },
]
const PALETTE_BTN_W = 88

/** 渲染所需的全部游戏状态（index.ts 持有并逐帧注入）。 */
export interface RobocodeView {
  /** 当前关卡。 */
  level: RoboLevel
  /** 编辑中的槽位程序。 */
  tokens: Token[]
  /** edit=编辑 / run=运行中 / won=过关 / fail=中断。 */
  mode: 'edit' | 'run' | 'won' | 'fail'
  /** 暂停中（叠加 overlay）。 */
  paused: boolean
  /** 短暂提示文本与剩余毫秒。 */
  message: string
  messageTtl: number
  /** 关卡总数（HUD 显示 N/总数）。 */
  levelCount: number
  /** 剩余芯片数（0 时闸门开启）。 */
  chipsLeft: number
  /** 已拾取芯片的格索引（渲染时消隐）。 */
  collected: number[]
  /** 运行轨迹与正在动画的步索引。 */
  trace: RunStep[]
  traceIndex: number
  /** 展开后第 i 条指令对应的槽位索引（运行进度高亮）。 */
  opToken: number[]
  /** 当前步动画进度 0..1 与时长 ms。 */
  animT: number
  stepMs: number
  /** 动画起点（插值用，dir 为连续角度）与终点状态。 */
  from: { x: number; y: number; dir: number }
  robot: { x: number; y: number; dir: Dir }
  /** 累计时长 ms（发光呼吸相位）。 */
  time: number
  /** 进入 fail 模式的时刻（自动复位计时）。 */
  failAt: number
  /** 中断原因文案。 */
  failReason: string
  /** 拾取 / 过关 / 中断的粒子系统。 */
  particles: ParticleSystem
}

/** 盘面几何：格边长与原点。 */
export interface BoardMetrics { cell: number; bx: number; by: number }

/**
 * 计算盘面几何（等比缩放居中）。
 * @param level 当前关卡。
 * @returns 格边长与盘面原点。
 */
export function boardMetrics(level: RoboLevel): BoardMetrics {
  const cell = Math.floor(Math.min((VIEW_W - 32) / level.w, (BOARD_BOTTOM - BOARD_TOP - 8) / level.h))
  const bx = (VIEW_W - cell * level.w) / 2
  const by = BOARD_TOP + (BOARD_BOTTOM - BOARD_TOP - cell * level.h) / 2
  return { cell, bx, by }
}

/**
 * 第 index 个槽位的矩形（多行时按行居中）。
 * @param index 槽位索引。
 * @param count 槽位总数（决定每行居中宽度）。
 * @returns 矩形 {x, y, w, h}。
 */
export function slotRect(index: number, count: number): { x: number; y: number; w: number; h: number } {
  const row = Math.floor(index / SLOTS_PER_ROW)
  const col = index % SLOTS_PER_ROW
  const rowLen = Math.min(count - row * SLOTS_PER_ROW, SLOTS_PER_ROW)
  const rowW = rowLen * (SLOT_W + SLOT_GAP) - SLOT_GAP
  const x = (VIEW_W - rowW) / 2 + col * (SLOT_W + SLOT_GAP)
  return { x, y: SLOTS_Y + row * (SLOT_H + SLOT_GAP), w: SLOT_W, h: SLOT_H }
}

/**
 * 命中测试：点击坐标落在哪个槽位。
 * @param px 逻辑 x。
 * @param py 逻辑 y。
 * @param count 槽位总数。
 * @returns 槽位索引，未命中返回 -1。
 */
export function slotHit(px: number, py: number, count: number): number {
  const rows = Math.ceil(count / SLOTS_PER_ROW)
  for (let r = 0; r < rows; r += 1) {
    const y = SLOTS_Y + r * (SLOT_H + SLOT_GAP)
    if (py < y || py > y + SLOT_H) continue
    const rowLen = Math.min(count - r * SLOTS_PER_ROW, SLOTS_PER_ROW)
    const rowW = rowLen * (SLOT_W + SLOT_GAP) - SLOT_GAP
    const x0 = (VIEW_W - rowW) / 2
    if (px < x0 || px > x0 + rowW) continue
    const col = Math.floor((px - x0) / (SLOT_W + SLOT_GAP))
    return r * SLOTS_PER_ROW + col
  }
  return -1
}

/**
 * 命中测试：点击坐标落在哪个面板按钮。
 * @param px 逻辑 x。
 * @param py 逻辑 y。
 * @returns 该按钮插入的记号（'clear' 表示清空），未命中返回 null。
 */
export function paletteHit(px: number, py: number): Token | 'clear' | null {
  if (py < PALETTE_Y || py > PALETTE_Y + PALETTE_H) return null
  const total = PALETTE.length * (PALETTE_BTN_W + SLOT_GAP) - SLOT_GAP
  const x0 = (VIEW_W - total) / 2
  if (px < x0 || px > x0 + total) return null
  const index = Math.floor((px - x0) / (PALETTE_BTN_W + SLOT_GAP))
  if (index < 0 || index >= PALETTE.length) return null
  return PALETTE[index]!.token
}

/** 朝向 → 画布角度（0=向上，顺时针）。 */
function dirAngle(dir: number): number {
  return dir * Math.PI / 2
}

/** 槽位记号的显示标签。 */
function tokenLabel(token: Token): string {
  if (typeof token === 'object') return '⟲' + String(token.loop)
  if (token === 'end') return '⤓'
  return token
}

/**
 * 渲染一帧：背景 → HUD → 盘面（含机器人插值动画）→ 指令面板 → 粒子 → overlay。
 * @param ctx 画布上下文（fitCanvas 已施加逻辑坐标变换）。
 * @param view 游戏状态。
 * @param dtMs 本帧毫秒（粒子推进用）。
 */
export function renderRobocode(ctx: CanvasRenderingContext2D, view: RobocodeView, dtMs: number): void {
  const level = view.level
  const m = boardMetrics(level)
  drawBackground(ctx, VIEW_W, VIEW_H)

  // HUD：关卡 / 芯片 / 槽位 / 预算（运行中额外显示步进度）
  ctx.textBaseline = 'alphabetic'
  // 列距加宽（16/250/420）避免长关卡名与后续列重叠出屏。
  hudPair(ctx, 16, 26, '关卡', String(level.id + 1) + '/' + String(view.levelCount) + ' · ' + level.name)
  const chipColor = view.chipsLeft === 0 ? THEME.good : THEME.gold
  hudPair(ctx, 250, 26, '芯片', String(level.chipsTotal - view.chipsLeft) + '/' + String(level.chipsTotal), 'left', chipColor)
  hudPair(ctx, 420, 26, '槽位', String(view.tokens.length) + '/' + String(level.maxSlots), 'left',
    view.tokens.length > level.maxSlots ? THEME.bad : THEME.text)
  const stepText = view.mode === 'run'
    ? '步 ' + String(view.traceIndex) + '/' + String(view.trace.length)
    : '预算 ' + String(level.budget)
  hudPair(ctx, VIEW_W - 16, 26, view.mode === 'run' ? '运行' : '预算', stepText, 'right',
    view.mode === 'run' ? accent(0) : THEME.text)

  // 盘面格子
  for (let y = 0; y < level.h; y += 1) {
    for (let x = 0; x < level.w; x += 1) {
      const cx = m.bx + x * m.cell
      const cy = m.by + y * m.cell
      const c = level.cells[y * level.w + x]!
      ctx.fillStyle = '#1c1c29'
      ctx.fillRect(cx, cy, m.cell - 1, m.cell - 1)
      if (c === CELL_WALL) {
        ctx.fillStyle = '#2c2c42'
        ctx.fillRect(cx, cy, m.cell - 1, m.cell - 1)
        ctx.strokeStyle = 'rgba(122,162,247,0.14)'
        ctx.lineWidth = 1
        ctx.strokeRect(cx + 2.5, cy + 2.5, m.cell - 6, m.cell - 6)
      } else if (c === CELL_SPIKE) {
        ctx.fillStyle = THEME.bad
        for (let s = 0; s < 3; s += 1) {
          const sx = cx + 3 + s * (m.cell - 8) / 3 + (m.cell - 14) / 6
          ctx.beginPath()
          ctx.moveTo(sx, cy + m.cell - 6)
          ctx.lineTo(sx + 4, cy + 6)
          ctx.lineTo(sx + 8, cy + m.cell - 6)
          ctx.closePath()
          ctx.fill()
        }
      } else if (c === CELL_PIT) {
        ctx.fillStyle = '#0b0b13'
        ctx.beginPath()
        ctx.ellipse(cx + m.cell / 2 - 0.5, cy + m.cell / 2 - 0.5, m.cell * 0.32, m.cell * 0.32, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(226,226,238,0.16)'
        ctx.stroke()
      } else if (c === CELL_CHIP) {
        const idx = y * level.w + x
        const taken = view.collected.includes(idx)
        const px = cx + m.cell / 2 - 0.5
        const py = cy + m.cell / 2 - 0.5
        if (!taken) {
          const pulse = 0.7 + 0.3 * Math.sin(view.time / 260 + (x + y))
          const size = m.cell * 0.2
          ctx.save()
          ctx.translate(px, py)
          ctx.rotate(Math.PI / 4)
          glow(ctx, THEME.gold, 8 * pulse)
          ctx.fillStyle = THEME.gold
          ctx.fillRect(-size, -size, size * 2, size * 2)
          noGlow(ctx)
          ctx.restore()
        } else {
          ctx.strokeStyle = 'rgba(224,175,104,0.28)'
          ctx.lineWidth = 1
          ctx.strokeRect(px - m.cell * 0.18, py - m.cell * 0.18, m.cell * 0.36, m.cell * 0.36)
        }
      } else if (c === CELL_GATE) {
        const open = view.chipsLeft === 0
        const px = cx + m.cell / 2 - 0.5
        const py = cy + m.cell / 2 - 0.5
        if (open) {
          const pulse = 0.6 + 0.4 * Math.sin(view.time / 200)
          glow(ctx, THEME.good, 10 * pulse)
          ctx.strokeStyle = THEME.good
          ctx.lineWidth = 2.5
          roundRectPath(ctx, cx + 4, cy + 4, m.cell - 9, m.cell - 9, 5)
          ctx.stroke()
          noGlow(ctx)
          ctx.fillStyle = THEME.good
          ctx.font = 'bold ' + Math.max(10, m.cell - 22) + 'px system-ui, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText('出', px, py + (m.cell - 22) / 3)
        } else {
          ctx.strokeStyle = 'rgba(247,118,142,0.75)'
          ctx.lineWidth = 2
          roundRectPath(ctx, cx + 4, cy + 4, m.cell - 9, m.cell - 9, 5)
          ctx.stroke()
          ctx.fillStyle = 'rgba(247,118,142,0.6)'
          for (let b = 0; b < 3; b += 1) {
            const barX = cx + 7 + b * (m.cell - 14) / 3 + (m.cell - 20) / 6 - 1.5
            ctx.fillRect(barX, cy + 7, 3, m.cell - 15)
          }
        }
      }
    }
  }

  // 机器人（插值：位置 + 朝向旋转 + 跳跃弧线）
  const t = Math.max(0, Math.min(1, view.animT))
  const ease = t * t * (3 - 2 * t)
  const rx = view.from.x + (view.robot.x - view.from.x) * ease
  const ry = view.from.y + (view.robot.y - view.from.y) * ease
  let delta = view.robot.dir - view.from.dir
  while (delta > 2) delta -= 4
  while (delta < -2) delta += 4
  const rdir = view.from.dir + delta * ease
  const current = view.trace[view.traceIndex]
  const jumping = view.mode === 'run' && current !== undefined && current.op === 'J' && t < 1
  const lift = jumping ? Math.sin(Math.PI * t) * m.cell * 0.45 : 0
  const px = m.bx + rx * m.cell + m.cell / 2 - 0.5
  const py = m.by + ry * m.cell + m.cell / 2 - 0.5 - lift
  ctx.save()
  ctx.translate(px, py)
  ctx.rotate(dirAngle(rdir))
  const size = m.cell * 0.32
  glow(ctx, accent(0), 12)
  ctx.fillStyle = '#26263a'
  roundRectPath(ctx, -size, -size, size * 2, size * 2, 6)
  ctx.fill()
  noGlow(ctx)
  ctx.strokeStyle = accent(0)
  ctx.lineWidth = 2
  roundRectPath(ctx, -size, -size, size * 2, size * 2, 6)
  ctx.stroke()
  ctx.fillStyle = accent(0)
  ctx.beginPath()
  ctx.moveTo(0, -size * 0.72)
  ctx.lineTo(size * 0.5, size * 0.42)
  ctx.lineTo(-size * 0.5, size * 0.42)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // 面板按钮行
  const total = PALETTE.length * (PALETTE_BTN_W + SLOT_GAP) - SLOT_GAP
  const px0 = (VIEW_W - total) / 2
  PALETTE.forEach((btn, i) => {
    const bx = px0 + i * (PALETTE_BTN_W + SLOT_GAP)
    const isClear = btn.token === 'clear'
    ctx.fillStyle = '#22222f'
    roundRectPath(ctx, bx, PALETTE_Y, PALETTE_BTN_W, PALETTE_H, 7)
    ctx.fill()
    ctx.strokeStyle = isClear ? 'rgba(247,118,142,0.5)' : 'rgba(122,162,247,0.35)'
    ctx.lineWidth = 1
    roundRectPath(ctx, bx + 0.5, PALETTE_Y + 0.5, PALETTE_BTN_W - 1, PALETTE_H - 1, 7)
    ctx.stroke()
    ctx.fillStyle = isClear ? THEME.bad : THEME.text
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(btn.label, bx + PALETTE_BTN_W / 2, PALETTE_Y + 25)
  })

  // 指令槽（循环配对同色高亮 + 运行中的当前指令描边）
  const pairColor: string[] = view.tokens.map(() => '')
  const pairStack: number[] = []
  view.tokens.forEach((token, i) => {
    if (typeof token === 'object') {
      pairColor[i] = accent(pairStack.length === 0 ? 2 : 5)
      pairStack.push(i)
    } else if (token === 'end') {
      const open = pairStack.pop()
      if (open !== undefined) pairColor[i] = pairColor[open]!
    }
  })
  const hl = view.mode === 'run' && view.opToken.length > 0 && view.traceIndex < view.opToken.length
    ? view.opToken[view.traceIndex]!
    : -1
  const slotCount = Math.max(view.tokens.length, Math.min(view.level.maxSlots, view.tokens.length + 4))
  for (let i = 0; i < slotCount; i += 1) {
    const rect = slotRect(i, slotCount)
    const token = view.tokens[i]
    if (token === undefined) {
      ctx.strokeStyle = 'rgba(226,226,238,0.14)'
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1
      roundRectPath(ctx, rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1, 6)
      ctx.stroke()
      ctx.setLineDash([])
      continue
    }
    const color = pairColor[i] ?? accent(0)
    ctx.fillStyle = '#22222f'
    roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 6)
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = i === hl ? 2.5 : 1.5
    roundRectPath(ctx, rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1, 6)
    ctx.stroke()
    if (i === hl) {
      glow(ctx, color, 8)
      roundRectPath(ctx, rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1, 6)
      ctx.stroke()
      noGlow(ctx)
    }
    ctx.fillStyle = i === hl ? THEME.text : color
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(tokenLabel(token), rect.x + rect.w / 2, rect.y + 24)
  }

  // 运行进度条（槽位区下缘）
  if (view.mode === 'run' && view.trace.length > 0) {
    const done = (view.traceIndex + Math.min(1, Math.max(0, view.animT))) / view.trace.length
    ctx.fillStyle = 'rgba(122,162,247,0.2)'
    ctx.fillRect(px0, SLOTS_Y + 2 * (SLOT_H + SLOT_GAP) + 2, total, 4)
    ctx.fillStyle = accent(0)
    ctx.fillRect(px0, SLOTS_Y + 2 * (SLOT_H + SLOT_GAP) + 2, total * done, 4)
  }

  // 提示与按键说明
  if (view.message !== '') {
    ctx.fillStyle = THEME.gold
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(view.message, VIEW_W / 2, SLOTS_Y + 2 * (SLOT_H + SLOT_GAP) + 26)
  } else {
    ctx.fillStyle = THEME.textMuted
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('点击面板插入指令 · 点击槽位删除 · 滚轮调循环次数 · 空格运行/停止 · R 重开 · P 暂停', VIEW_W / 2, VIEW_H - 10)
  }

  view.particles.tick(ctx, dtMs)

  // overlay：过关 / 中断 / 暂停
  if (view.mode === 'won') {
    drawOverlay(ctx, VIEW_W, VIEW_H, '过关！', '空格：下一关 · R：重开本关', THEME.good)
  } else if (view.mode === 'fail') {
    drawOverlay(ctx, VIEW_W, VIEW_H, '程序中断', view.failReason + ' · 即自动复位重编', THEME.bad)
  } else if (view.paused) {
    drawOverlay(ctx, VIEW_W, VIEW_H, '已暂停', 'P：继续')
  }
}
