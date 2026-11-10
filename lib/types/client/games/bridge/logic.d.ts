/**
 * 过桥难题 Bridge 纯逻辑：手电筒过桥谜题的状态机。夜里一座窄桥一次
 * 最多容两人同行，且必须有手电照路；同行用时按较慢者计。全部函数为
 * 纯函数（不触碰 DOM / 计时器），关卡速度表由注入 seed 的 mulberry32
 * 生成，限时 = BFS 最优总用时 + 少量宽裕，确定性可测。
 */
/**
 * mulberry32 确定性伪随机数生成器。
 * @param seed - 32 位整数种子。
 * @returns 返回 [0, 1) 区间随机数的函数；同种子必产出同一序列。
 */
export declare function mulberry32(seed: number): () => number;
/** 岸侧（手电所在岸即出发岸）。 */
export type Side = 'left' | 'right';
/** 一名待过桥的人：速度 = 单独过桥所需秒数（1-10）。 */
export interface BridgePerson {
    /** 关卡内唯一 id。 */
    id: string;
    /** 过桥用时（秒），数值越大走得越慢。 */
    speed: number;
}
/** 一关的完整定义。 */
export interface BridgeLevel {
    /** 关卡名（HUD 显示）。 */
    name: string;
    /** 本关全部人员（初始都在左岸），速度互不相同。 */
    people: BridgePerson[];
    /** 限时（秒）：全员到右岸且累计用时不得超过它。 */
    limit: number;
}
/**
 * 求某关全员过桥的最少总用时（Dijkstra 最短路，状态 =（左岸成员位图,
 * 手电所在岸），边权 = 同行较慢者的用时；同时充当可行性证明）。
 * @param level 关卡定义。
 * @returns 最少总用时（秒）。
 */
export declare function optimalTime(level: BridgeLevel): number;
/**
 * 由速度表构造一关：id 依次编号，限时 = 最优总用时 + 宽裕秒数。
 * @param name 关卡名。
 * @param speeds 各人过桥用时（秒）。
 * @param slack 限时超出最优解的宽裕秒数。
 * @returns 完整关卡定义。
 */
export declare function makeCustomLevel(name: string, speeds: number[], slack: number): BridgeLevel;
/**
 * 五关递进：人数 4 → 6，宽裕从 +2 收紧到 +4（最优解变长后按比例放大），
 * 速度表由固定种子生成，逐关确定性不变。
 */
export declare const LEVELS: readonly BridgeLevel[];
/**
 * 取关卡定义（越界收敛到首 / 末关）。
 * @param index 0 起的关卡下标。
 */
export declare function levelFor(index: number): BridgeLevel;
/** 游戏状态：两岸名单 + 手电所在岸 + 累计用时。全部为不可变快照。 */
export interface BridgeState {
    /** 左岸人员 id 列表。 */
    left: string[];
    /** 右岸人员 id 列表。 */
    right: string[];
    /** 手电（出发权）所在岸。 */
    flashlight: Side;
    /** 累计用时（秒）。 */
    elapsed: number;
}
/**
 * 某关开局：全体在左岸，手电在左岸，用时 0。
 * @param levelIndex 0 起的关卡下标。
 */
export declare function createInitialState(levelIndex: number): BridgeState;
/**
 * 一组人同行的用时：取组内最慢者。
 * @param level 关卡定义（速度表）。
 * @param ids 同行者 id（1-2 人）。
 */
export declare function crossTime(level: BridgeLevel, ids: readonly string[]): number;
/**
 * 过桥：1-2 名手电所在岸的人携灯同行到对岸，累计用时按较慢者累加，
 * 手电翻到对岸。方向由 state.flashlight 决定，无需显式传入。
 * @param state 当前状态（不被修改）。
 * @param level 关卡定义。
 * @param ids 同行者 id 列表。
 * @returns 新状态；人数越界、含重复 id 或有人不在手电岸时返回 null。
 */
export declare function cross(state: BridgeState, level: BridgeLevel, ids: readonly string[]): BridgeState | null;
/** 局面判定结果。 */
export type BridgeStatus = {
    phase: 'playing';
} | {
    phase: 'won';
} | {
    phase: 'timeout';
};
/**
 * 判定当前局面：全员到右岸（左岸清空）且未超时即胜利；累计用时超过
 * 限时即超时失败。
 * @param state 当前状态。
 * @param level 关卡定义（提供限时）。
 */
export declare function evaluate(state: BridgeState, level: BridgeLevel): BridgeStatus;
