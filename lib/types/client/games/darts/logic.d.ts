/**
 * 飞镖 501 纯逻辑：标准 20 分区镖盘（双倍环 / 三倍环 / 内外靶心），
 * 玩家与可选 AI 从 501 分逐镖扣减。落点判定按「极径 → 环型、极角 →
 * 分区」完成；恰好归零且最后一镖命中双倍环或红心（50）才算结账获胜；
 * 扣成负数、归零但末镖非双倍、或恰好剩 1 分即为爆分（bust），本 turn
 * 分数回退到回合起点并交出投掷权。所有随机（漂移相位、AI 抖动）都来自
 * 注入的 mulberry32 种子，同种子序列完全确定、可测。
 */
/** 逻辑画布宽度（渲染与逻辑共用坐标系）。 */
export declare const LOGICAL_W = 480;
/** 逻辑画布高度。 */
export declare const LOGICAL_H = 340;
/** 镖盘半径（逻辑像素）。 */
export declare const BOARD_R = 138;
/** 标准分区顺序：从正上方顺时针开始的 20 个扇区分值。 */
export declare const SECTORS: readonly number[];
/** 各环半径（镖盘半径倍率，取标准镖盘 170mm 归一化）。 */
export declare const DOUBLE_OUTER = 1;
export declare const DOUBLE_INNER: number;
export declare const TRIPLE_OUTER: number;
export declare const TRIPLE_INNER: number;
export declare const BULL_OUTER: number;
export declare const BULL_INNER: number;
/** 起始分数与赛制。 */
export declare const START_SCORE = 501;
export declare const DARTS_PER_TURN = 3;
export declare const MAX_ROUNDS = 5;
/** 手抖漂移幅度（镖盘半径倍率）：两路正弦叠加的类 perlin 游走。 */
export declare const DRIFT_AMPL = 0.05;
/** 落点环型。 */
export type Ring = 'miss' | 'single' | 'double' | 'triple' | 'bull25' | 'bull50';
/** 一次投掷的判定结果（坐标为相对盘心的镖盘半径倍率单位）。 */
export interface ThrowResult {
    x: number;
    y: number;
    /** 命中分区分值（1-20；靶心为 25/50，脱靶为 0）。 */
    sector: number;
    ring: Ring;
    /** 本镖得分（分区 × 环倍率或靶心分）。 */
    points: number;
    bust: boolean;
    checkout: boolean;
}
/** 一方的计分状态。 */
interface PlayerScore {
    /** 当前剩余（501 逐镖扣减）。 */
    remaining: number;
    /** 本 turn 开始时的剩余（bust 回退基准）。 */
    turnStart: number;
}
/** 飞镖对局状态（可变对象 + 注入 rng，纯函数操作）。 */
export interface DartsState {
    seed: number;
    rng: () => number;
    vsAI: boolean;
    /** 漂移相位（创建时由种子派生，driftAt 只读）。 */
    driftPhase: [number, number, number, number];
    /** 当前轮次（human 回合计数，1 起）。 */
    round: number;
    turn: 'human' | 'ai';
    human: PlayerScore;
    ai: PlayerScore;
    /** 本 turn 已投镖数。 */
    dartIndex: number;
    /** 本 turn 的落点标记（渲染用，turn 开始时清空）。 */
    marks: {
        x: number;
        y: number;
        player: 'human' | 'ai';
    }[];
    /** 最近一镖判定（HUD 显示）。 */
    lastResult: ThrowResult | null;
    /** 最近一次爆分提示（渲染高亮，新 turn 清除）。 */
    lastBust: boolean;
    winner: null | 'human' | 'ai' | 'draw';
}
/** mulberry32：注入用确定性伪随机源。
 * @param seed - 32 位种子。
 * @returns 返回 0..1 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 判定相对盘心一点的分区与环型。
 * @param dx - 相对盘心 x（镖盘半径倍率，x 向右、y 向上为正）。
 * @param dy - 相对盘心 y。
 * @returns 分区分值、环型与得分。
 */
export declare function scoreAt(dx: number, dy: number): {
    sector: number;
    ring: Ring;
    points: number;
};
/** 手抖漂移向量（类 perlin：两路不同频率正弦叠加，相位来自种子）。
 * @param state - 对局状态（只读 driftPhase）。
 * @param t - 时间秒。
 * @returns 漂移偏移（镖盘半径倍率单位）。
 */
export declare function driftAt(state: DartsState, t: number): {
    dx: number;
    dy: number;
};
/** 新对局：双方 501，human 先手，第 1 轮。
 * @param seed - 随机种子（漂移相位与 AI 用）。
 * @param vsAI - true 时对手为简单 AI。
 * @returns 初始状态。
 */
export declare function createDartsState(seed: number, vsAI: boolean): DartsState;
/** 剩余分结账建议；无法一 turn 结账（>170 或著名的不可结算分）返回 null。
 * @param remaining - 当前剩余分。
 * @returns 建议路线文本，或 null。
 */
export declare function checkoutHint(remaining: number): string | null;
/** 按剩余分选择 AI 瞄准点（偏好双倍收尾，其余在 T20 / 大分区里随机）。
 * @param remaining - AI 当前剩余分。
 * @param rng - 注入随机源。
 * @returns 瞄准点（镖盘半径倍率单位）。
 */
export declare function aiAim(remaining: number, rng: () => number): {
    x: number;
    y: number;
};
/** 某分区某环中心点坐标。
 * @param sector - 分区分值（2-20 须为整数分值；双倍收尾用 sector = 目标/2）。
 * @param ring - 环型。
 * @returns 瞄准点坐标。
 */
export declare function sectorPoint(sector: number, ring: 'single' | 'double' | 'triple'): {
    x: number;
    y: number;
};
/** 玩家投一镖：落点 = 瞄准点 + 手抖漂移（同种子同时间完全确定）。
 * @param state - 对局状态。
 * @param aimX - 瞄准点 x（镖盘半径倍率单位）。
 * @param aimY - 瞄准点 y。
 * @param t - 当前时间秒（驱动漂移）。
 * @returns 本镖判定；非玩家 turn 或对局已结束时返回 null。
 */
export declare function throwDart(state: DartsState, aimX: number, aimY: number, t: number): ThrowResult | null;
/** AI 连投一整个 turn（最多三镖，遇爆分 / 结账提前停）。
 * @param state - 对局状态（须处于 ai turn）。
 * @returns 本 turn 各镖判定。
 */
export declare function runAiTurn(state: DartsState): ThrowResult[];
export {};
