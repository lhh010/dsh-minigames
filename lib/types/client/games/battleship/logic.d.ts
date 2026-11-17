/**
 * 海战棋（Battleship）纯逻辑：布舰合法性（边界/重叠/贴边）、seed 随机
 * 布舰、开炮命中与沉舰判定、AI 概率热图与命中追击、回合与胜负状态机。
 * 全部随机走注入 seed（mulberry32），同一 seed 重放完全一致，可测可复盘。
 */
/**
 * 确定性伪随机数生成器（mulberry32）。
 * @param seed - 32 位非负整数种子。
 * @returns 每次调用依种子产生一个 [0,1) 的确定序列值。
 */
export declare function mulberry32(seed: number): () => number;
/** 海图边长（10×10）。 */
export declare const BOARD = 10;
/** 一艘舰的静态定义。 */
export interface ShipDef {
    /** 舰名（中文，用于沉舰提示）。 */
    name: string;
    /** 占格数。 */
    size: number;
}
/** 标准舰队：航母5 / 战列舰4 / 巡洋舰3 / 潜艇3 / 驱逐舰2。 */
export declare const FLEET: readonly ShipDef[];
/** 一艘舰的摆放：左上锚点 + 朝向（true 横向，false 纵向）。 */
export interface Placement {
    row: number;
    col: number;
    horizontal: boolean;
}
/**
 * 摆放覆盖的全部格子坐标。
 * @param p - 摆放锚点与朝向。
 * @param size - 舰长。
 * @returns [行, 列] 坐标数组，按舰身顺序排列。
 */
export declare function shipCells(p: Placement, size: number): Array<[number, number]>;
/**
 * 单舰是否完整落在海图内。
 * @param p - 待检摆放。
 * @param size - 舰长。
 * @returns 越界返回 false。
 */
export declare function placementInBounds(p: Placement, size: number): boolean;
/**
 * 摆放是否可下子：不出界、与已放舰不重叠且不贴边（含对角）。
 * @param placed - 已放好的其余舰（下标与 FLEET 对齐）。
 * @param p - 待检摆放。
 * @param size - 待检舰长。
 * @returns 合法返回 true。
 */
export declare function canPlace(placed: Placement[], p: Placement, size: number): boolean;
/**
 * 整支舰队是否合法：数量齐、每舰在界内、互不重叠且不贴边。
 * @param fleet - 与 FLEET 等长的摆放数组。
 * @returns 合法返回 true。
 */
export declare function isLegalFleet(fleet: Placement[]): boolean;
/**
 * seed 一键随机布舰：按 FLEET 顺序（大舰优先）随机试摆到合法为止。
 * @param seed - 种子。
 * @returns 合法舰队摆放数组。
 */
export declare function randomFleet(seed: number): Placement[];
/** 一方（玩家或 AI）的战场状态。 */
export interface SideState {
    /** 己方舰队摆放（按 FLEET 顺序）。 */
    fleet: Placement[];
    /** 对方对己方的炮击记录：0 未打 / 1 miss / 2 hit。 */
    shots: number[][];
}
/**
 * 格子所属舰的下标。
 * @param side - 战场状态。
 * @param row - 行。
 * @param col - 列。
 * @returns 覆盖该格的舰下标，无舰返回 -1。
 */
export declare function shipIndexAt(side: SideState, row: number, col: number): number;
/**
 * 各舰是否已沉（全部格被打中）。
 * @param side - 战场状态。
 * @returns 与 fleet 对齐的布尔数组。
 */
export declare function sunkFlags(side: SideState): boolean[];
/** 一次开炮的结果。 */
export interface FireResult {
    /** repeat 重复打已打过的格 / miss 未中 / hit 命中。 */
    kind: 'repeat' | 'miss' | 'hit';
    /** 本次击沉的舰名；未沉为 null。 */
    sunk: string | null;
}
/**
 * 对 side 开炮并落盘（原地修改 shots）。
 * @param side - 被打一方的战场状态。
 * @param row - 行。
 * @param col - 列。
 * @returns 开炮结果；repeat 不改变任何状态。
 */
export declare function fireAt(side: SideState, row: number, col: number): FireResult;
/**
 * 概率热图：对每格统计「还有未沉舰的合法放置方式数」作权重。
 * 只统计完全避开 miss 与已 hit 格的放置；已开过炮的格权重恒 0。
 * @param side - 开炮方视角的对方战场（读 shots 与沉舰状态）。
 * @returns 10×10 权重矩阵。
 */
export declare function heatMap(side: SideState): number[][];
/**
 * 追击目标格：尚未沉没的舰上的命中格的上下左右未打邻格（去重）。
 * @param side - 开炮方视角的对方战场。
 * @returns [行, 列] 列表；无未沉命中格时为空。
 */
export declare function huntTargets(side: SideState): Array<[number, number]>;
/**
 * AI 选格开炮。难度 1–5：L1 纯随机；L2+ 命中邻域追击；L4+ 空档期按热图
 * 加权；L5 追击候选也按热图加权。
 * @param side - AI 视角的玩家战场。
 * @param difficulty - 1–5。
 * @param rand - 注入随机源。
 * @returns 选定的 [行, 列]（必为未打过的格；无格可打返回 [0,0]）。
 */
export declare function aiChooseShot(side: SideState, difficulty: number, rand: () => number): [number, number];
/** 一整局对局状态机。 */
export interface Battle {
    /** 本局种子（决定 AI 布舰与其随机源初值）。 */
    seed: number;
    /** 1–5 难度。 */
    difficulty: number;
    /** 玩家战场（AI 打这里）。 */
    player: SideState;
    /** AI 战场（玩家打这里，舰队隐藏）。 */
    ai: SideState;
    /** 当前回合归属。 */
    turn: 'player' | 'ai';
    /** battle 进行中 / won 玩家胜 / lost AI 胜。 */
    phase: 'battle' | 'won' | 'lost';
    /** AI 随机源（seed 派生，重放一致）。 */
    rand: () => number;
}
/**
 * 开一局：玩家舰队已布好，AI 舰队由 seed 派生隐藏布置；玩家先手。
 * @param seed - 种子。
 * @param playerFleet - 玩家舰队摆放（须合法）。
 * @param difficulty - 1–5。
 * @returns 对局状态。
 */
export declare function startBattle(seed: number, playerFleet: Placement[], difficulty: number): Battle;
/**
 * 玩家开炮；命中保持玩家回合，miss 换 AI。终局置 phase。
 * @param b - 对局状态。
 * @param row - 行。
 * @param col - 列。
 * @returns 开炮结果；非玩家回合或已终局返回 repeat 且不改状态。
 */
export declare function playerFire(b: Battle, row: number, col: number): FireResult;
/** AI 开炮结果（带落点）。 */
export interface AiFireResult extends FireResult {
    /** 落点行。 */
    row: number;
    /** 落点列。 */
    col: number;
}
/**
 * AI 开炮（自动选格）；命中保持 AI 回合连开，miss 换玩家。终局置 phase。
 * @param b - 对局状态。
 * @returns 落点与开炮结果。
 */
export declare function aiFire(b: Battle): AiFireResult;
