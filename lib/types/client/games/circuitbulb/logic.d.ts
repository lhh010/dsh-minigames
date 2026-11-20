/**
 * 电路点灯 CircuitBulb 纯逻辑：开关-灯泡布尔电路谜题。
 * 每个灯泡由若干开关的布尔表达式（直连/NOT/AND/OR/XOR）决定亮灭；
 * 关卡由 seed 确定性生成，并用穷举求解器验证"让全部灯泡亮起"的开关
 * 组合唯一。无 DOM、无定时器——全部函数可测。
 */
/** 确定性 mulberry32 伪随机数生成器（沿 tests/pipes-logic.spec.ts 先例）。 */
export declare function mulberry32(seed: number): () => number;
/** 布尔表达式节点：var 引用开关下标；not/and/or/xor 为五种运算。 */
export type Expr = {
    kind: 'var';
    index: number;
} | {
    kind: 'not';
    inner: Expr;
} | {
    kind: 'and';
    left: Expr;
    right: Expr;
} | {
    kind: 'or';
    left: Expr;
    right: Expr;
} | {
    kind: 'xor';
    left: Expr;
    right: Expr;
};
/** 关卡允许的表达式运算种类。 */
export type OpKind = 'direct' | 'not' | 'and' | 'or' | 'xor';
/** 递进关卡配置：开关数、灯泡数、可用运算、嵌套深度。 */
export interface LevelConfig {
    switches: number;
    bulbs: number;
    /** 允许出现的一元/二元运算（'direct' 表示允许单开关直连）。 */
    ops: OpKind[];
    /** 0：只有字面开关；1：允许 ¬开关；2：允许 ¬(子表达式) 嵌套。 */
    nest: number;
}
/** 总关卡数。 */
export declare const LEVEL_COUNT = 5;
/** 关卡难度配置：开关 6→12、灯泡 5→9、运算逐步解锁、嵌套加深。 */
export declare function levelConfig(level: number): LevelConfig;
/** 开关名：下标 0 起的字母 A、B、C…… */
export declare function switchName(index: number): string;
/**
 * 求值布尔表达式。
 * @param expr 表达式树。
 * @param states 各开关当前状态（下标对应 expr.var.index）。
 * @returns 表达式的布尔值。
 */
export declare function evalExpr(expr: Expr, states: boolean[]): boolean;
/**
 * 符号化表达式（如 'A·¬B'、'A+(B⊕C)'、'¬(A·B)'）。
 * @param expr 表达式树。
 * @returns 人类可读的逻辑式字符串。
 */
export declare function formatExpr(expr: Expr): string;
/** 表达式引用的全部开关下标（去重、升序）。 */
export declare function exprVars(expr: Expr): number[];
/**
 * 穷举求解：找出让全部灯泡亮起的开关组合。
 * @param bulbs 每个灯泡的表达式。
 * @param switches 开关总数。
 * @returns 唯一解对应的位掩码数组（位 i = 开关 i 闭合）。
 */
export declare function solveAll(bulbs: Expr[], switches: number): number[];
/** 一关的完整数据：灯泡表达式 + 唯一解 + PAR。 */
export interface Level {
    /** 关卡号（1 起）。 */
    level: number;
    /** 使用的关卡配置。 */
    config: LevelConfig;
    /** 每个灯泡的布尔表达式。 */
    bulbs: Expr[];
    /** 唯一解位掩码（位 i = 开关 i 应闭合）。 */
    solution: number;
    /** 最少拨动次数（从全关出发 = 解中闭合开关的个数）。 */
    par: number;
}
/** 位掩码中 1 的个数。 */
export declare function popcount(mask: number): number;
/** 把位掩码还原成开关状态数组。 */
export declare function maskToStates(mask: number, switches: number): boolean[];
/**
 * 生成一关：随机表达式 + 穷举验证唯一解；不唯一则换派生 seed 重试。
 * @param seed 玩家种子。
 * @param level 关卡号（1 起，钳制到 1..LEVEL_COUNT）。
 * @returns 含唯一解与 PAR 的关卡数据。
 */
export declare function makeLevel(seed: number, level: number): Level;
/** 一局运行状态（不可变：每次操作返回新对象）。 */
export interface GameState {
    level: number;
    levelData: Level;
    /** 各开关当前状态。 */
    states: boolean[];
    /** 已拨动次数。 */
    moves: number;
    /** 已用提示次数。 */
    hintsUsed: number;
    /** 本关是否已达全亮。 */
    won: boolean;
}
/**
 * 开局（或按同 seed 重开）：开关全部断开、零拨动。
 * @param seed 玩家种子。
 * @param level 关卡号。
 */
export declare function createGame(seed: number, level: number): GameState;
/**
 * 拨动一个开关（纯函数）。
 * @param state 当前状态。
 * @param index 开关下标；越界时原样返回。
 * @returns 拨动后的新状态（重新判定胜负）。
 */
export declare function toggleSwitch(state: GameState, index: number): GameState;
/** 各灯泡在给定开关状态下的亮灭。 */
export declare function bulbStates(levelData: Level, states: boolean[]): boolean[];
/** 是否全部灯泡亮起（过关判定）。 */
export declare function isAllLit(levelData: Level, states: boolean[]): boolean;
/** 一次提示：指出一个当前拨错的开关及其正确状态。 */
export interface Hint {
    /** 开关下标。 */
    index: number;
    /** 该开关应有的状态。 */
    shouldBe: boolean;
}
/**
 * 请求提示：从"与唯一解不一致"的开关里随机挑一个，告知正确状态。
 * @param state 当前状态。
 * @param rng 提示挑选用的随机源（注入保证可测）。
 * @returns 提示对象；当前已与解完全一致时返回 null。
 */
export declare function pickHint(state: GameState, rng: () => number): Hint | null;
/** 每关提示次数上限。 */
export declare const MAX_HINTS = 2;
/**
 * 过关得分：以 PAR 为基准，多拨一次扣分、每个提示扣分，下限 100。
 * @param state 已过关的状态。
 * @returns 本关得分。
 */
export declare function scoreFor(state: GameState): number;
