/**
 * 编程机器人 RoboCode 纯逻辑：关卡定义与解析、程序（基础指令 + 循环块）
 * 校验、循环展开与确定性逐步执行。无 DOM、无随机源——同一关卡与同一
 * 程序永远产出逐字段相同的执行轨迹，渲染层与测试都直接消费这份轨迹。
 */

/** 朝向枚举：0=北 1=东 2=南 3=西（右转为 +1 mod 4，左转为 +3 mod 4）。 */
export type Dir = 0 | 1 | 2 | 3

/** 基础指令：前进、左转、右转、跳跃（跨一格坑/尖刺）、双格前进。 */
export type Op = 'F' | 'L' | 'R' | 'J' | 'F2'

/** 循环块开始记号，n 为重复次数（1..8）。 */
export interface LoopToken { loop: number }

/** 程序槽中的一个记号：基础指令、循环开始（LoopToken）或循环结束 'end'。 */
export type Token = Op | 'end' | LoopToken

/** 格子类型编码（cells 数组元素）。 */
export const CELL_FLOOR = 0
export const CELL_WALL = 1
export const CELL_CHIP = 2
export const CELL_GATE = 3
export const CELL_SPIKE = 4
export const CELL_PIT = 5

/** 循环次数允许范围。 */
export const LOOP_MIN_N = 1
export const LOOP_MAX_N = 8
/** 循环最大嵌套层数。 */
export const MAX_NESTING = 2
/** 展开保护上限：展开后的总步数绝不允许超过该值（防组合爆炸）。 */
const EXPAND_CAP = 10000

/** 朝向 → 单位位移（下标即 Dir 值）。 */
const DX = [0, 1, 0, -1]
const DY = [-1, 0, 1, 0]

/** 字符网格记号 → 格子类型编码。R（起点）按空地处理。 */
const CELL_BY_CHAR: Readonly<Record<string, number>> = {
  '.': CELL_FLOOR, '#': CELL_WALL, 'C': CELL_CHIP, 'G': CELL_GATE,
  '^': CELL_SPIKE, 'O': CELL_PIT, 'R': CELL_FLOOR,
}

/** 关卡原始规格（字符串网格 + 约束 + 参考程序）。 */
export interface RoboLevelSpec {
  /** 关卡序号（从 0 起）。 */
  readonly id: number
  /** 关卡名。 */
  readonly name: string
  /** 等宽字符串网格：每行一个字符串，R=起点。 */
  readonly grid: readonly string[]
  /** 机器人初始朝向。 */
  readonly startDir: Dir
  /** 指令槽上限（谜题核心约束）。 */
  readonly maxSlots: number
  /** 总步数预算（运行期执行步数上限）。 */
  readonly budget: number
  /** 参考程序（已验证可解）。 */
  readonly reference: readonly Token[]
}

/** 解析后的可执行关卡。 */
export interface RoboLevel {
  readonly id: number
  readonly name: string
  readonly w: number
  readonly h: number
  /** 格子类型（行优先，索引 y*w+x）。 */
  readonly cells: Uint8Array
  readonly startX: number
  readonly startY: number
  readonly startDir: Dir
  readonly maxSlots: number
  readonly budget: number
  /** 芯片总数。 */
  readonly chipsTotal: number
  readonly reference: readonly Token[]
}

/**
 * 解析关卡规格为可执行关卡。
 * @param spec 原始规格（网格等宽、恰含一个 R 与一个 G、至少一枚芯片）。
 * @returns 解析后的关卡。
 * @throws 网格非法（不等宽 / 缺 R / 缺 G / 未知字符）时抛错——关卡是内置数据，错误应在加载期暴露。
 */
export function parseLevel(spec: RoboLevelSpec): RoboLevel {
  const w = spec.grid[0]!.length
  const cells = new Uint8Array(w * spec.grid.length)
  let startX = -1
  let startY = -1
  let chipsTotal = 0
  let gates = 0
  spec.grid.forEach((row, y) => {
    if (row.length !== w) throw new Error('robocode: 关卡 ' + spec.id + ' 网格不等宽')
    for (let x = 0; x < w; x += 1) {
      const ch = row[x]!
      const cell = CELL_BY_CHAR[ch]
      if (cell === undefined) throw new Error('robocode: 关卡 ' + spec.id + ' 含未知字符 ' + ch)
      if (ch === 'R') { startX = x; startY = y }
      if (cell === CELL_CHIP) chipsTotal += 1
      if (cell === CELL_GATE) gates += 1
      cells[y * w + x] = cell
    }
  })
  if (startX < 0) throw new Error('robocode: 关卡 ' + spec.id + ' 缺少起点 R')
  if (gates !== 1) throw new Error('robocode: 关卡 ' + spec.id + ' 必须恰有一个终点闸门 G')
  if (chipsTotal === 0) throw new Error('robocode: 关卡 ' + spec.id + ' 必须至少有一枚芯片')
  return {
    id: spec.id, name: spec.name, w, h: spec.grid.length, cells,
    startX, startY, startDir: spec.startDir, maxSlots: spec.maxSlots,
    budget: spec.budget, chipsTotal, reference: spec.reference,
  }
}

/** 内置 5 关：直线收集 → 转向序列 → 必须用循环 → 嵌套循环 → 综合迷宫。 */
export const ROBOCODE_LEVELS: readonly RoboLevelSpec[] = [
  {
    id: 0, name: '直线收集',
    grid: [
      '#########',
      '#R.C.C.G#',
      '#########',
    ],
    startDir: 1, maxSlots: 8, budget: 32,
    reference: ['F', 'F', 'F', 'F', 'F', 'F'],
  },
  {
    id: 1, name: '转向序列',
    grid: [
      '#######',
      '#R.C..#',
      '#.##C##',
      '#....G#',
      '#######',
    ],
    startDir: 1, maxSlots: 8, budget: 32,
    reference: ['F', 'F', 'F', 'R', 'F', 'F', 'L', 'F'],
  },
  {
    id: 2, name: '必须用循环',
    grid: [
      '###########',
      '#R..C....G#',
      '###########',
    ],
    startDir: 1, maxSlots: 5, budget: 24,
    reference: [{ loop: 8 }, 'F', 'end'],
  },
  {
    id: 3, name: '嵌套循环',
    grid: [
      '#######',
      '#R.C..#',
      '#.###.#',
      '#....C#',
      '#.###.#',
      '#G.C..#',
      '#######',
    ],
    startDir: 1, maxSlots: 6, budget: 48,
    reference: [{ loop: 3 }, { loop: 4 }, 'F', 'end', 'R', 'end'],
  },
  {
    id: 4, name: '综合迷宫',
    grid: [
      '#########',
      '#R.C....#',
      '#.#####.#',
      '#.#O###.#',
      '#.#####.#',
      '#..^.CG.#',
      '#########',
    ],
    startDir: 1, maxSlots: 16, budget: 48,
    reference: ['F', 'F', 'R', 'R', 'F', 'F', 'L', 'F2', 'F2', 'L', 'F', 'J', 'F', 'F'],
  },
]

/**
 * 全部内置关卡（按序解析）。
 * @returns 解析后的关卡数组。
 */
export function getLevels(): RoboLevel[] {
  return ROBOCODE_LEVELS.map(parseLevel)
}

/**
 * 展开程序：消除循环块得到基础指令序列。
 * @param tokens 待展开的程序记号。
 * @returns 展开结果：ops 为指令序列，opToken[i] 为 ops[i] 来源槽位索引；结构非法（未闭合 / 多余 end / 嵌套超限 / 超出展开保护）返回 null。
 */
export function expandProgram(tokens: readonly Token[]): { ops: Op[]; opToken: number[] } | null {
  const match = new Int32Array(tokens.length).fill(-1)
  const stack: number[] = []
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!
    if (typeof token === 'object') {
      if (stack.length >= MAX_NESTING) return null
      stack.push(i)
    } else if (token === 'end') {
      const open = stack.pop()
      if (open === undefined) return null
      match[open] = i
      match[i] = open
    }
  }
  if (stack.length > 0) return null
  const ops: Op[] = []
  const opToken: number[] = []
  const emit = (from: number, to: number): boolean => {
    for (let i = from; i < to; i += 1) {
      const token = tokens[i]!
      if (typeof token === 'object') {
        const close = match[i]!
        for (let r = 0; r < token.loop; r += 1) {
          if (!emit(i + 1, close)) return false
        }
        i = close
      } else if (token !== 'end') {
        if (ops.length >= EXPAND_CAP) return false
        ops.push(token)
        opToken.push(i)
      }
    }
    return true
  }
  if (!emit(0, tokens.length)) return null
  return { ops, opToken }
}

/**
 * 校验程序是否可在该关卡运行。
 * @param level 提供槽位与预算约束的关卡。
 * @param tokens 待校验的程序。
 * @returns null 表示合法；否则为中文错误原因。
 */
export function validateProgram(level: RoboLevel, tokens: readonly Token[]): string | null {
  if (tokens.length > level.maxSlots) return '指令槽位超限（最多 ' + level.maxSlots + ' 个）'
  const stack: number[] = []
  for (const token of tokens) {
    if (typeof token === 'object') {
      if (token.loop < LOOP_MIN_N || token.loop > LOOP_MAX_N) return '循环次数需在 ' + LOOP_MIN_N + '..' + LOOP_MAX_N + ' 之间'
      if (stack.length >= MAX_NESTING) return '循环嵌套最多 ' + MAX_NESTING + ' 层'
      stack.push(token.loop)
    } else if (token === 'end') {
      if (stack.pop() === undefined) return '多余的 end（没有与之配对的循环）'
    }
  }
  if (stack.length > 0) return '循环未闭合（缺少 end）'
  const expanded = expandProgram(tokens)
  if (expanded === null) return '程序结构非法'
  if (expanded.ops.length > level.budget) return '展开后 ' + expanded.ops.length + ' 步，超过预算 ' + level.budget
  return null
}

/** 一步的事件类型：正常动作 / 拾取 / 过关 / 中断原因。 */
export type StepEvent = 'move' | 'turn' | 'jump' | 'pick' | 'win' | 'blocked' | 'spike' | 'budget'

/** 执行轨迹中的一步（事件后的机器人状态）。 */
export interface RunStep {
  /** 该步的基础指令。 */
  op: Op
  /** 事件后所在格。 */
  x: number
  y: number
  /** 事件后朝向。 */
  dir: Dir
  /** 事件类型。 */
  event: StepEvent
  /** 事件后剩余芯片数。 */
  chipsLeft: number
}

/** 一次程序执行的完整结果。 */
export interface RunResult {
  /** won=进入终点闸门；crashed=中途中断（撞墙/尖刺/预算）；incomplete=执行完毕但未过关。 */
  status: 'won' | 'crashed' | 'incomplete'
  /** 中文原因描述。 */
  reason: string
  /** 逐步轨迹（含最后一步的中断/过关事件）。 */
  steps: RunStep[]
  /** 结束时机器人状态。 */
  x: number
  y: number
  dir: Dir
  /** 结束时剩余芯片数。 */
  chipsLeft: number
}

/**
 * 逐步执行展开后的指令序列。
 * 语义：F 撞墙/出界/坑/未开的闸门即中断；踩尖刺即中断；进入芯片格拾取；
 * 全部芯片拾取后闸门开启，踩入即过关；J 向前跳两格（中间格可以是坑/尖刺，
 * 不拾取其中芯片），落点为墙/坑/出界/未开闸门则中断，落点尖刺则中断。
 * @param level 目标关卡。
 * @param ops 展开后的指令序列。
 * @returns 完整执行结果（确定性：同输入同输出）。
 */
export function executeProgram(level: RoboLevel, ops: readonly Op[]): RunResult {
  const steps: RunStep[] = []
  let x = level.startX
  let y = level.startY
  let dir = level.startDir
  let chipsLeft = level.chipsTotal
  let status: RunResult['status'] = 'incomplete'
  let reason = '程序执行完毕，但机器人没有抵达终点闸门'
  const cell = (cx: number, cy: number): number => {
    if (cx < 0 || cy < 0 || cx >= level.w || cy >= level.h) return CELL_WALL
    return level.cells[cy * level.w + cx]!
  }
  const push = (op: Op, event: StepEvent): void => { steps.push({ op, x, y, dir, event, chipsLeft }) }
  /** 前进一格；返回 false 表示程序应中断（事件已记录在轨迹末步）。 */
  const forward = (op: Op): boolean => {
    const nx = x + DX[dir]!
    const ny = y + DY[dir]!
    const c = cell(nx, ny)
    if (c === CELL_WALL || c === CELL_PIT || (c === CELL_GATE && chipsLeft > 0)) {
      push(op, 'blocked')
      return false
    }
    x = nx
    y = ny
    if (c === CELL_SPIKE) {
      push(op, 'spike')
      return false
    }
    if (c === CELL_CHIP) {
      chipsLeft -= 1
      push(op, 'pick')
    } else {
      push(op, 'move')
    }
    if (c === CELL_GATE && chipsLeft === 0) {
      push(op, 'win')
      return false
    }
    return true
  }
  /** 跳跃跨一格；返回语义同 forward。 */
  const jump = (op: Op): boolean => {
    const mx = x + DX[dir]!
    const my = y + DY[dir]!
    const lx = x + 2 * DX[dir]!
    const ly = y + 2 * DY[dir]!
    if (cell(mx, my) === CELL_WALL || cell(lx, ly) === CELL_WALL) {
      push(op, 'blocked')
      return false
    }
    const c = cell(lx, ly)
    if (c === CELL_PIT || (c === CELL_GATE && chipsLeft > 0)) {
      push(op, 'blocked')
      return false
    }
    x = lx
    y = ly
    if (c === CELL_SPIKE) {
      push(op, 'spike')
      return false
    }
    if (c === CELL_CHIP) {
      chipsLeft -= 1
      push(op, 'pick')
    } else {
      push(op, 'jump')
    }
    if (c === CELL_GATE && chipsLeft === 0) {
      push(op, 'win')
      return false
    }
    return true
  }
  let halted = false
  const halt = (won: boolean, crashReason: string): void => {
    status = won ? 'won' : 'crashed'
    reason = won ? '芯片全部拾取，闸门开启，过关！' : crashReason
    halted = true
  }
  for (const op of ops) {
    if (halted) break
    if (steps.length >= level.budget) {
      push(op, 'budget')
      halt(false, '步数预算耗尽（死循环保护）')
      break
    }
    if (op === 'L' || op === 'R') {
      dir = ((dir + (op === 'R' ? 1 : 3)) % 4) as Dir
      push(op, 'turn')
      continue
    }
    if (op === 'J') {
      if (!jump(op)) {
        const last = steps[steps.length - 1]!
        halt(last.event === 'win', last.event === 'spike' ? '跳跃落在尖刺上' : '跳跃被阻挡（墙 / 坑 / 未开的闸门）')
      }
      continue
    }
    const moves = op === 'F2' ? 2 : 1
    for (let m = 0; m < moves && !halted; m += 1) {
      if (!forward(op)) {
        const last = steps[steps.length - 1]!
        halt(last.event === 'win', last.event === 'spike' ? '踩到尖刺' : '撞墙 / 被未开的闸门阻挡，程序中断')
      }
    }
  }
  if (!halted && steps.length > 0 && steps[steps.length - 1]!.event === 'win') {
    status = 'won'
    reason = '芯片全部拾取，闸门开启，过关！'
  }
  return { status, reason, steps, x, y, dir, chipsLeft }
}

/** runProgram 的返回：合法时给出完整结果与 op→槽位映射。 */
export interface CompiledRun {
  /** null 表示可运行；否则为校验错误原因。 */
  error: string | null
  /** 执行结果（error 非 null 时为 null）。 */
  result: RunResult | null
  /** 展开后第 i 条指令对应的槽位索引（运行进度高亮用）。 */
  opToken: number[]
}

/**
 * 校验并执行一段槽位程序（编辑器到轨迹的一步到位入口）。
 * @param level 目标关卡。
 * @param tokens 槽位记号。
 * @returns 校验错误或确定性执行结果。
 */
export function runProgram(level: RoboLevel, tokens: readonly Token[]): CompiledRun {
  const error = validateProgram(level, tokens)
  if (error !== null) return { error, result: null, opToken: [] }
  const expanded = expandProgram(tokens)
  if (expanded === null) return { error: '程序结构非法', result: null, opToken: [] }
  return { error: null, result: executeProgram(level, expanded.ops), opToken: expanded.opToken }
}
