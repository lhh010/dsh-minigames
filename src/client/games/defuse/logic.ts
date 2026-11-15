/**
 * 拆弹专家（Defuse）纯逻辑：Keep Talking 式读规则剪线。每颗炸弹面板
 * 由 seed 确定性地生成：N 根彩线（红黄蓝绿白，4-7 根）+ 面板属性
 * （标记符号 / 序列号 / 电池数）+ 从 8 种规则池抽取的 2-3 张复合条件
 * 规则卡。规则对「面板事实」求值出必须剪 / 禁止剪的颜色集合；玩家
 * 剪断任一非应剪线 → 立即爆炸失败，剪完全部应剪线 → 拆除成功进入
 * 下一颗；倒计时归零 → 爆炸失败。5 颗炸弹递进（线数 / 规则数增加、
 * 时限收紧）。生成时验证规则互不矛盾且至少一根应剪线（保证有解）。
 * 所有随机走注入 seed（mulberry32），同 seed 同局数轨迹完全一致。
 */

/** 逻辑画布尺寸（含 HUD 区域）。 */
export const W = 480
export const H = 640
/** 总炸弹数（过关数）。 */
export const MAX_BOMBS = 5
/** 每根应剪线正确剪断的得分。 */
export const CUT_SCORE = 15
/** 每颗炸弹拆除得分。 */
export const BOMB_SCORE = 120
/** 五颗全拆的胜利加分。 */
export const WIN_SCORE = 200
/** 拆除成功→下一颗的过渡动画时长 ms（期间计时冻结、输入忽略）。 */
export const DEFUSE_MS = 800

/** 线缆颜色（固定五种）。 */
export type WireColor = 'red' | 'yellow' | 'blue' | 'green' | 'white'

/** 全部线缆颜色（渲染与生成共用顺序）。 */
export const WIRE_COLORS: readonly WireColor[] = ['red', 'yellow', 'blue', 'green', 'white']

/** 颜色的中文名（规则文本 / 图例用）。 */
export const WIRE_LABEL: Record<WireColor, string> = {
  red: '红', yellow: '黄', blue: '蓝', green: '绿', white: '白',
}

/** 面板可能出现的标记符号（'' 表示无标记；仅 ★ 计为星标）。 */
export const MARKS: readonly string[] = ['★', '●', '▲', '◆', '']

/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 第 bombIndex 颗炸弹的线数（4,5,6,7,7 递进，上限 7）。
 * @param bombIndex - 炸弹号（0 起）。
 * @returns 线缆数量。
 */
export function wiresFor(bombIndex: number): number {
  return Math.min(7, 4 + Math.ceil((bombIndex * 3) / 4))
}

/**
 * 第 bombIndex 颗炸弹的规则卡数（2,2,3,3,3 递进）。
 * @param bombIndex - 炸弹号（0 起）。
 * @returns 规则数量（2-3）。
 */
export function rulesFor(bombIndex: number): number {
  return bombIndex < 2 ? 2 : 3
}

/**
 * 第 bombIndex 颗炸弹的倒计时 ms（60s → 36s 收紧）。
 * @param bombIndex - 炸弹号（0 起）。
 * @returns 时限毫秒数。
 */
export function timeFor(bombIndex: number): number {
  return 60000 - bombIndex * 6000
}

/** 规则卡的八种类型（条件 → 必须剪 / 禁止剪某颜色）。 */
export type DefuseRule =
  | { type: 'noStarCutRed' }
  | { type: 'evenBlueForbidGreen' }
  | { type: 'dupLetterForbidRedYellow' }
  | { type: 'batteries2CutYellow' }
  | { type: 'oddWiresCutLast' }
  | { type: 'noWhiteForbidBlue' }
  | { type: 'singleGreenCutGreen' }
  | { type: 'oddBatteriesCutBlue' }

/** 全部规则类型池（生成时按 seed 抽取不重复的子集）。 */
export const RULE_POOL: readonly DefuseRule['type'][] = [
  'noStarCutRed', 'evenBlueForbidGreen', 'dupLetterForbidRedYellow', 'batteries2CutYellow',
  'oddWiresCutLast', 'noWhiteForbidBlue', 'singleGreenCutGreen', 'oddBatteriesCutBlue',
]

/** 由面板属性派生的事实（规则条件的求值输入）。 */
export interface PanelFacts {
  /** 线数。 */
  wireCount: number
  /** 各颜色线数。 */
  colorCount: Record<WireColor, number>
  /** 是否有 ★ 标记。 */
  hasStar: boolean
  /** 序列号字母部分是否含重复字母。 */
  duplicateLetter: boolean
  /** 电池数。 */
  batteries: number
  /** 最右一根线的颜色。 */
  lastColor: WireColor
}

/** 一颗炸弹的完整面板（生成时已验证有解且规则互不矛盾）。 */
export interface DefuseBomb {
  /** 线缆颜色序列（左→右）。 */
  wires: WireColor[]
  /** 标记符号（'' 为无标记）。 */
  mark: string
  /** 序列号（3 字母 + 2 数字）。 */
  serial: string
  /** 电池数（0-3）。 */
  batteries: number
  /** 规则卡（类型不重复）。 */
  rules: DefuseRule[]
  /** 面板事实（求值结果随面板固定）。 */
  facts: PanelFacts
  /** 各线是否应剪（条件求值 + 禁止优先的最终判定）。 */
  mustCut: boolean[]
}

/** 规则求值结果：必须剪 / 禁止剪的颜色集合。 */
export interface RuleVerdict {
  mustColors: WireColor[]
  forbidColors: WireColor[]
}

/**
 * 由面板派生规则求值所需的事实。
 * @param wires - 线缆颜色序列。
 * @param mark - 标记符号。
 * @param serial - 序列号。
 * @param batteries - 电池数。
 * @returns 面板事实。
 */
export function panelFacts(wires: WireColor[], mark: string, serial: string, batteries: number): PanelFacts {
  const colorCount: Record<WireColor, number> = { red: 0, yellow: 0, blue: 0, green: 0, white: 0 }
  for (const c of wires) colorCount[c] += 1
  const letters = [...serial].filter((ch) => ch >= 'A' && ch <= 'Z')
  const seen = new Set<string>()
  let duplicateLetter = false
  for (const ch of letters) {
    if (seen.has(ch)) duplicateLetter = true
    seen.add(ch)
  }
  return {
    wireCount: wires.length,
    colorCount,
    hasStar: mark === '★',
    duplicateLetter,
    batteries,
    lastColor: wires[wires.length - 1] ?? 'red',
  }
}

/**
 * 对面板事实求值一组规则：条件成立的规则把其颜色并入必须剪 / 禁止剪
 * 集合（oddWiresCutLast 的颜色取事实里的最右线颜色）。
 * @param rules - 规则卡数组。
 * @param facts - 面板事实。
 * @returns 必须剪与禁止剪的颜色集合。
 */
export function evaluateRules(rules: DefuseRule[], facts: PanelFacts): RuleVerdict {
  const must: WireColor[] = []
  const forbid: WireColor[] = []
  const pushMust = (c: WireColor): void => { if (!must.includes(c)) must.push(c) }
  const pushForbid = (c: WireColor): void => { if (!forbid.includes(c)) forbid.push(c) }
  for (const rule of rules) {
    switch (rule.type) {
      case 'noStarCutRed':
        if (!facts.hasStar) pushMust('red')
        break
      case 'evenBlueForbidGreen':
        if (facts.colorCount.blue % 2 === 0) pushForbid('green')
        break
      case 'dupLetterForbidRedYellow':
        if (facts.duplicateLetter) { pushForbid('red'); pushForbid('yellow') }
        break
      case 'batteries2CutYellow':
        if (facts.batteries >= 2) pushMust('yellow')
        break
      case 'oddWiresCutLast':
        if (facts.wireCount % 2 === 1) pushMust(facts.lastColor)
        break
      case 'noWhiteForbidBlue':
        if (facts.colorCount.white === 0) pushForbid('blue')
        break
      case 'singleGreenCutGreen':
        if (facts.colorCount.green === 1) pushMust('green')
        break
      case 'oddBatteriesCutBlue':
        if (facts.batteries % 2 === 1) pushMust('blue')
        break
    }
  }
  return { mustColors: must, forbidColors: forbid }
}

/**
 * 规则卡的展示文本（条件 → 结论）。
 * @param rule - 规则卡。
 * @returns 中文规则文本。
 */
export function ruleText(rule: DefuseRule): string {
  switch (rule.type) {
    case 'noStarCutRed': return '面板无 ★ 标记 → 必须剪红线'
    case 'evenBlueForbidGreen': return '蓝线数为偶数 → 绿线不可剪'
    case 'dupLetterForbidRedYellow': return '序列号含重复字母 → 红黄线均不可剪'
    case 'batteries2CutYellow': return '电池数 ≥ 2 → 必须剪黄线'
    case 'oddWiresCutLast': return '线数为奇数 → 必须剪最右线颜色'
    case 'noWhiteForbidBlue': return '面板无白线 → 蓝线不可剪'
    case 'singleGreenCutGreen': return '恰有一根绿线 → 必须剪绿线'
    case 'oddBatteriesCutBlue': return '电池数为奇数 → 必须剪蓝线'
  }
}

/**
 * 规则卡图例涉及的颜色（条件里的参照色不算，只列结论色）。
 * @param rule - 规则卡。
 * @param facts - 面板事实（oddWiresCutLast 需要最右线颜色）。
 * @returns 图例颜色数组。
 */
export function ruleColors(rule: DefuseRule, facts: PanelFacts): WireColor[] {
  switch (rule.type) {
    case 'noStarCutRed': return ['red']
    case 'evenBlueForbidGreen': return ['green']
    case 'dupLetterForbidRedYellow': return ['red', 'yellow']
    case 'batteries2CutYellow': return ['yellow']
    case 'oddWiresCutLast': return [facts.lastColor]
    case 'noWhiteForbidBlue': return ['blue']
    case 'singleGreenCutGreen': return ['green']
    case 'oddBatteriesCutBlue': return ['blue']
  }
}

/**
 * 生成第 bombIndex 颗炸弹：seed 确定性抽线 / 属性 / 规则，并验证
 * （至少一根应剪线、无颜色同时落在必须剪与禁止剪集合）；不合法则
 * 用同一 rng 继续抽取重试（上限 400 次，实践中数次内命中）。
 * @param seed - 本局种子。
 * @param round - 局数。
 * @param bombIndex - 炸弹号（0 起）。
 * @returns 已验证有解的炸弹面板。
 */
export function buildBomb(seed: number, round: number, bombIndex: number): DefuseBomb {
  const rng = mulberry32((Math.floor(seed) * 101 + round * 137 + bombIndex * 71) >>> 0)
  const wireCount = wiresFor(bombIndex)
  const ruleCount = rulesFor(bombIndex)
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const wires: WireColor[] = []
    for (let i = 0; i < wireCount; i += 1) wires.push(WIRE_COLORS[Math.floor(rng() * WIRE_COLORS.length)]!)
    const distinct = new Set(wires)
    if (distinct.size < 2) continue
    const mark = MARKS[Math.floor(rng() * MARKS.length)]!
    const letters: string[] = []
    for (let i = 0; i < 3; i += 1) letters.push(String.fromCharCode(65 + Math.floor(rng() * 26)))
    // 四成概率强制第三位复用首位，制造重复字母面板。
    if (rng() < 0.4) letters[2] = letters[0]!
    const serial = letters.join('') + String(Math.floor(rng() * 10)) + String(Math.floor(rng() * 10))
    const batteries = Math.floor(rng() * 4)
    // Fisher-Yates 抽不重复规则子集。
    const pool = [...RULE_POOL]
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      const tmp = pool[i]!
      pool[i] = pool[j]!
      pool[j] = tmp
    }
    const rules: DefuseRule[] = pool.slice(0, ruleCount).map((type) => ({ type }))
    const facts = panelFacts(wires, mark, serial, batteries)
    const verdict = evaluateRules(rules, facts)
    const mustCut = wires.map((c) => verdict.mustColors.includes(c) && !verdict.forbidColors.includes(c))
    if (!mustCut.some((m) => m)) continue
    let contradiction = false
    for (const c of wires) {
      if (verdict.mustColors.includes(c) && verdict.forbidColors.includes(c)) contradiction = true
    }
    if (contradiction) continue
    return { wires, mark, serial, batteries, rules, facts, mustCut }
  }
  // 理论不可达（400 次内必命中合法面板）；保底返回固定合法面板。
  const fallbackColors: readonly WireColor[] = ['red', 'blue', 'green', 'yellow']
  const fallbackRules: readonly DefuseRule[] = [{ type: 'noStarCutRed' }, { type: 'batteries2CutYellow' }]
  const wires: WireColor[] = fallbackColors.slice(0, wireCount)
  const rules: DefuseRule[] = fallbackRules.slice(0, ruleCount)
  const facts = panelFacts(wires, '', 'ABC12', 3)
  return { wires, mark: '', serial: 'ABC12', batteries: 3, rules, facts, mustCut: wires.map(() => true) }
}

/** 单步内产生、供渲染层消费的可视事件。 */
export type DefuseEvent =
  | { type: 'cut', wire: number }
  | { type: 'defuse', bomb: number }
  | { type: 'bomb', bomb: number }
  | { type: 'explode' }
  | { type: 'win' }

/** 一局游戏的完整可测状态。 */
export interface DefuseState {
  /** 本局种子与局数（生成依赖，保持确定性）。 */
  seed: number
  round: number
  /** 回合内已流逝 ms。 */
  t: number
  score: number
  /** 当前炸弹号（0 起；拆完第 MAX_BOMBS 颗即胜利）。 */
  bombIndex: number
  /** 五颗炸弹（开局一次性生成）。 */
  bombs: DefuseBomb[]
  /** 当前炸弹各线是否已剪断。 */
  cut: boolean[]
  /** 当前炸弹剩余 ms。 */
  timeLeft: number
  /** 拆除过渡剩余 ms（>0 时计时冻结、输入忽略）。 */
  defuseMs: number
  events: DefuseEvent[]
  over: boolean
  won: boolean
}

/**
 * 装配第 bombIndex 颗炸弹到状态（重置剪断标记与倒计时）。
 * @param state - 目标状态。
 * @param bombIndex - 炸弹号（0 起）。
 */
function setupBomb(state: DefuseState, bombIndex: number): void {
  state.bombIndex = bombIndex
  state.cut = state.bombs[bombIndex]!.wires.map(() => false)
  state.timeLeft = timeFor(bombIndex)
}

/**
 * 新开一局：同 seed 同 round 的整局轨迹完全一致。
 * @param seed - 外部种子。
 * @param round - 第几局（同 seed 不同局轨迹不同）。
 * @returns 初始状态。
 */
export function createDefuse(seed: number, round = 1): DefuseState {
  const bombs: DefuseBomb[] = []
  for (let i = 0; i < MAX_BOMBS; i += 1) bombs.push(buildBomb(seed, round, i))
  const state: DefuseState = {
    seed: Math.floor(seed),
    round,
    t: 0,
    score: 0,
    bombIndex: 0,
    bombs,
    cut: [],
    timeLeft: 0,
    defuseMs: 0,
    events: [],
    over: false,
    won: false,
  }
  setupBomb(state, 0)
  return state
}

/**
 * 剪断一根线：已剪 / 结束 / 过渡中忽略；剪到非应剪线立即爆炸失败；
 * 剪到应剪线记分，全部应剪线剪完进入拆除过渡。
 * @param state - 目标状态。
 * @param index - 线缆索引（0 起，左→右）。
 */
export function cutWire(state: DefuseState, index: number): void {
  if (state.over || state.defuseMs > 0) return
  if (index < 0 || index >= state.cut.length || state.cut[index]) return
  const bomb = state.bombs[state.bombIndex]!
  if (!bomb.mustCut[index]) {
    state.cut[index] = true
    state.over = true
    state.won = false
    state.events.push({ type: 'explode' })
    return
  }
  state.cut[index] = true
  state.score += CUT_SCORE
  state.events.push({ type: 'cut', wire: index })
  if (bomb.mustCut.every((m, i) => !m || state.cut[i])) {
    state.score += BOMB_SCORE
    state.defuseMs = DEFUSE_MS
    state.events.push({ type: 'defuse', bomb: state.bombIndex + 1 })
  }
}

/**
 * 推进一帧：倒计时归零即爆炸；拆除过渡结束后装配下一颗炸弹或胜利。
 * 事件写入 state.events，下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export function stepDefuse(state: DefuseState, dtMs: number): void {
  state.events.length = 0
  if (state.over) return
  state.t += dtMs
  if (state.defuseMs > 0) {
    state.defuseMs = Math.max(0, state.defuseMs - dtMs)
    if (state.defuseMs <= 0) {
      const next = state.bombIndex + 1
      if (next >= MAX_BOMBS) {
        state.over = true
        state.won = true
        state.score += WIN_SCORE
        state.events.push({ type: 'win' })
      } else {
        setupBomb(state, next)
        state.events.push({ type: 'bomb', bomb: next + 1 })
      }
    }
    return
  }
  state.timeLeft -= dtMs
  if (state.timeLeft <= 0) {
    state.timeLeft = 0
    state.over = true
    state.won = false
    state.events.push({ type: 'explode' })
  }
}

/**
 * 当前炸弹还需剪的应剪线数量（HUD 进度用，不泄露具体线位）。
 * @param state - 当前状态。
 * @returns 剩余应剪线数量。
 */
export function remainingMustCuts(state: DefuseState): number {
  const bomb = state.bombs[state.bombIndex]!
  let n = 0
  for (let i = 0; i < bomb.mustCut.length; i += 1) {
    if (bomb.mustCut[i] && !state.cut[i]) n += 1
  }
  return n
}
