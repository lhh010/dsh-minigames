/**
 * 泡泡纸（Bubble Wrap）纯逻辑：一板 COLS×ROWS 个泡泡，点击或按住扫过
 * 逐个捏爆（状态矩阵，纯数据无随机）。1 秒内连续捏爆累计 combo，每次
 * 捏爆得 1 分 + (combo-1) 的加成（封顶 COMBO_CAP）；一板全爆自动换新板
 * （板号 +1，配色随板号轮换，由渲染层处理）。纯休闲零失败、无时间限制，
 * 唯一时钟 t 只用于 combo 窗口与飘字老化。所有函数均为确定性纯操作，
 * 同一操作序列必然得到同一状态。
 */
/** 逻辑画布宽度 px。 */
export declare const W = 480;
/** 逻辑画布高度 px。 */
export declare const H = 600;
/** HUD 条高度 px（含在 H 内）。 */
export declare const HUD_H = 34;
/** 每板列数。 */
export declare const COLS = 10;
/** 每板行数。 */
export declare const ROWS = 14;
/** 连捏窗口 ms：窗口内再捏则 combo +1。 */
export declare const COMBO_WINDOW_MS = 1000;
/** combo 加成上限（每个泡泡最多加 COMBO_CAP 分）。 */
export declare const COMBO_CAP = 9;
/** 飘字存活时长 ms。 */
export declare const FLOAT_MS = 800;
/** 新板提示飘字存活时长 ms。 */
export declare const BOARD_FLOAT_MS = 1200;
/**
 * 泡泡网格几何：格子边长与原点（棋盘在 HUD 下方水平居中）。
 * @returns cell 边长、ox/oy 原点与泡泡半径。
 */
export declare function boardGeometry(): {
    cell: number;
    ox: number;
    oy: number;
    r: number;
};
/**
 * 泡泡圆心坐标（逻辑 px）。
 * @param row - 行号（0 起）。
 * @param col - 列号（0 起）。
 * @returns 圆心 {x, y}。
 */
export declare function bubbleCenter(row: number, col: number): {
    x: number;
    y: number;
};
/**
 * 命中检测：逻辑坐标落在哪个泡泡上。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 * @returns 行列号；未落在任何泡泡内返回 null。
 */
export declare function hitBubble(x: number, y: number): {
    row: number;
    col: number;
} | null;
/** 单步内产生、供渲染层消费的可视事件。 */
export type BubbleEvent = {
    type: 'pop';
    row: number;
    col: number;
    x: number;
    y: number;
    combo: number;
    gained: number;
} | {
    type: 'board';
    board: number;
};
/** 上浮渐隐的飘字。 */
export interface FloatText {
    x: number;
    y: number;
    text: string;
    life: number;
    maxLife: number;
}
/** 一局游戏的完整可测状态。 */
export interface BubbleWrapState {
    /** 游戏内毫秒钟（暂停时不推进）。 */
    t: number;
    /** 累计分。 */
    score: number;
    /** 当前板号（从 1 起，全爆 +1）。 */
    board: number;
    /** 已捏爆总数（跨板累计）。 */
    totalPopped: number;
    /** 当前 combo（窗口过期后显示归零由 comboExpire 判定）。 */
    combo: number;
    /** combo 失效时刻 ms（游戏钟）。 */
    comboExpire: number;
    /** 历史最高 combo（HUD 展示）。 */
    bestCombo: number;
    /** 泡泡状态矩阵：true = 已爆。行主序 popped[row][col]。 */
    popped: boolean[][];
    /** 本帧事件（每帧开头清空）。 */
    events: BubbleEvent[];
    /** 飘字列表。 */
    floats: FloatText[];
}
/**
 * 新开一局（第 1 板全未爆）。无随机源：同种子同状态。
 * @param _seed - 兼容其他游戏 create(seed) 习惯的种子（未使用，泡泡纸无随机）。
 * @returns 初始状态。
 */
export declare function createBubbleWrap(_seed?: number): BubbleWrapState;
/**
 * 读取当前板的状态矩阵副本（测试 / 渲染用）。
 * @param state - 当前状态。
 * @returns popped[row][col] 的深拷贝。
 */
export declare function poppedBoard(state: BubbleWrapState): boolean[][];
/**
 * 当前板已爆个数。
 * @param state - 当前状态。
 * @returns 已爆泡泡数。
 */
export declare function poppedCount(state: BubbleWrapState): number;
/**
 * 换新板：板号 +1、矩阵清空、combo 归零（新板从零连捏）。
 * @param state - 目标状态（就地更新）。
 */
export declare function resetBoard(state: BubbleWrapState): void;
/**
 * 捏爆一个泡泡（若未爆）：结算 combo 与得分、写入 pop 事件；
 * 一板全爆时自动换新板。纯确定性操作。
 * @param state - 目标状态（就地更新）。
 * @param row - 行号（0 起）。
 * @param col - 列号（0 起）。
 * @returns 本次得分（已爆的泡泡返回 0）。
 */
export declare function popAt(state: BubbleWrapState, row: number, col: number): number;
/**
 * 指针位置捏爆（hitBubble 命中才有效）。确定性。
 * @param state - 目标状态。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 * @returns 本次得分（未命中或已爆返回 0）。
 */
export declare function popAtPoint(state: BubbleWrapState, x: number, y: number): number;
/**
 * 整板一键全爆（彩蛋式操作，未绑定按键；保留为纯函数供测试 / 调用）。
 * @param state - 目标状态（就地更新，逐个按行序结算并自动换板）。
 * @returns 本板剩余泡泡的合计得分。
 */
export declare function popAll(state: BubbleWrapState): number;
/**
 * 推进一帧：游戏钟、combo 窗口与飘字老化。事件在每帧开头清空，
 * 调用方（渲染层）在 step 之后、下一帧之前消费。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 */
export declare function stepBubbleWrap(state: BubbleWrapState, dtMs: number): void;
/**
 * 当前 combo 是否仍有效（HUD 高亮判定）。
 * @param state - 当前状态。
 * @returns true 表示连捏窗口未过。
 */
export declare function comboActive(state: BubbleWrapState): boolean;
