/**
 * 寻宝猎人（warmer/colder 冷热探测）纯逻辑：seed 随机布置荒岛地形装饰、
 * 真宝藏与（第 4 关起）假宝藏；玩家点击任意格探测，得到与上一次探测点
 * 相比的三态反馈——更热（更近）/ 更冷（更远）/ 同温（等距），基于欧氏
 * 距离平方（整数比较，精确无浮点误差）；第 4 关起探测器被假宝藏混淆，
 * 反馈按探测点到最近假宝藏的距离计算，指认时须避开假宝藏。探测次数
 * 耗尽后进入指认阶段：点一格指认，正确过关（分数含剩余探测次数加成，
 * 同心圆助手开启时计分减半），错误即失败。共 5 关递进：盘面更大、
 * 探测次数更少、后期出现假宝藏。全部随机走注入 seed 的 mulberry32，
 * 确定性可测、可重放。
 */
/** 5 关递进参数：盘面列数 / 行数、探测次数、假宝藏数。 */
export declare const LEVELS: ReadonlyArray<Readonly<{
    cols: number;
    rows: number;
    probes: number;
    fakes: number;
}>>;
/** 地形装饰种类：沙滩 / 草地 / 椰树 / 岩石 / 灌木。 */
export type Decor = 'sand' | 'grass' | 'palm' | 'rock' | 'bush';
/** 探测反馈：首探（无比较）/ 更热 / 更冷 / 同温。 */
export type Feedback = 'first' | 'hotter' | 'colder' | 'same';
/** 阶段：探测 / 指认 / 过关通关 / 失败。 */
export type Phase = 'probe' | 'identify' | 'won' | 'lost';
/** 一条探测历史：坐标 + 三态反馈。 */
export interface ProbeRecord {
    /** 行（0 起，自上而下）。 */
    r: number;
    /** 列（0 起，自左向右）。 */
    c: number;
    /** 与上一次探测比较的反馈。 */
    feedback: Feedback;
}
/** 目标格坐标。 */
export interface Spot {
    r: number;
    c: number;
}
/** 一局寻宝的全部可测状态（不含渲染信息）。 */
export interface TreasureState {
    /** 当前关卡（1 起）。 */
    level: number;
    /** 盘面列数（随关卡变化）。 */
    cols: number;
    /** 盘面行数。 */
    rows: number;
    /** 真宝藏位置（渲染平时不泄露）。 */
    treasure: Spot;
    /** 假宝藏位置（第 4 关起 2 个，探测反馈被其混淆）。 */
    fakes: Spot[];
    /** 每格地形装饰。 */
    decor: Decor[][];
    /** 剩余探测次数。 */
    probesLeft: number;
    /** 探测历史（含首探），供侧栏与反馈比较。 */
    history: ProbeRecord[];
    /** 当前阶段。 */
    phase: Phase;
    /** 同心圆助手开关（开启时过关计分减半）。 */
    helperOn: boolean;
    /** 本关提示（H）是否已用。 */
    hintUsed: boolean;
    /** 提示排除格（true = 已确认不可能是真宝藏）。 */
    excluded: boolean[][];
    /** 累计得分。 */
    score: number;
    /** 注入的确定性随机源。 */
    rng: () => number;
}
/**
 * mulberry32 确定性随机数生成器：全部游戏随机（地形、宝藏布置）都走它，
 * 同一 seed 序列完全一致，保证可测可重放。
 * @param seed - 32 位非负整数种子。
 * @returns 返回 [0, 1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 两格欧氏距离的平方（整数，比较精确）。
 * @param r1 - 第一格行。
 * @param c1 - 第一格列。
 * @param r2 - 第二格行。
 * @param c2 - 第二格列。
 * @returns 距离平方。
 */
export declare function dist2(r1: number, c1: number, r2: number, c2: number): number;
/**
 * 探测参考距离：无假宝藏时为到真宝藏的距离平方；有假宝藏时探测器被
 * 混淆，取到最近假宝藏的距离平方（与真宝藏无关）。
 * @param state - 游戏状态。
 * @param r - 探测格行。
 * @param c - 探测格列。
 * @returns 参考距离平方。
 */
export declare function referenceDist2(state: TreasureState, r: number, c: number): number;
/**
 * 创建一局新冒险：第 1 关、0 分，地形与宝藏布置由 seed 决定。
 * @param seed - 32 位种子，相同种子得到完全相同的关卡序列。
 * @returns 初始 TreasureState。
 */
export declare function createTreasureState(seed: number): TreasureState;
/**
 * 在 (r, c) 探测一次：与上一次探测的参考距离比较得到三态反馈并记入
 * 历史；探测次数减一，耗尽后自动进入指认阶段。
 * @param state - 游戏状态（就地修改）。
 * @param r - 探测格行。
 * @param c - 探测格列。
 * @returns 本次反馈；不在探测阶段（已进入指认 / 已终局）或越界时返回
 * null 且状态不变。
 */
export declare function probe(state: TreasureState, r: number, c: number): Feedback | null;
/**
 * 提前进入指认阶段（也可等探测次数自然耗尽）：保留的探测次数转化为
 * 指认成功的加分。
 * @param state - 游戏状态（就地修改）。
 */
export declare function enterIdentify(state: TreasureState): void;
/**
 * 指认 (r, c) 为真宝藏：正确过关并计分（非最终关加载下一关，第 5 关
 * 通关）；指到空格或假宝藏均失败。
 * @param state - 游戏状态（就地修改）。
 * @param r - 指认格行。
 * @param c - 指认格列。
 * @returns 'correct' 正确 / 'wrong' 错误 / null 不在指认阶段或越界。
 */
export declare function identify(state: TreasureState, r: number, c: number): 'correct' | 'wrong' | null;
/**
 * 切换同心圆助手（等距圆参考线）开关；开启时过关计分减半。
 * @param state - 游戏状态（就地修改）。
 * @returns 切换后的开关状态。
 */
export declare function toggleHelper(state: TreasureState): boolean;
/**
 * 使用 H 提示：把按行主序编号 mod 3 == k 的整类格子（约占 1/3）标记为
 * 排除区；k 取不含真宝藏的最小编号——真宝藏只有 1 个，3 类中至少 2 类
 * 不含它，故必然存在且这些格全都不是真宝藏。每关限用 1 次。
 * @param state - 游戏状态（就地修改）。
 * @returns 是否成功使用（重复使用或已终局返回 false）。
 */
export declare function useHint(state: TreasureState): boolean;
