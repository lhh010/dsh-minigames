/**
 * 过河 River Crossing 纯逻辑：经典渡河约束谜题的状态机。左岸若干角色，
 * 农夫撑船（容量 = 农夫 + 若干乘客），任一时刻无农夫看管的岸上出现
 * 捕食者与猎物同处即判定失败。全部函数为纯函数（不触碰 DOM / 计时器），
 * 随机只通过注入 seed 的 mulberry32 产生，确定性可测。
 */
/**
 * mulberry32 确定性伪随机数生成器。
 * @param seed - 32 位整数种子。
 * @returns 返回 [0, 1) 区间随机数的函数；同种子必产出同一序列。
 */
export declare function mulberry32(seed: number): () => number;
/** 一名可渡河的角色。 */
export interface RiverCharacter {
    /** 关卡内唯一 id。 */
    id: string;
    /** 岸上 / 船上绘制的 emoji。 */
    emoji: string;
    /** 中文名（警告文案用）。 */
    name: string;
}
/** 一关的完整定义。 */
export interface RiverLevel {
    /** 关卡名（HUD 显示）。 */
    name: string;
    /** 本关全部角色（初始都在左岸）。 */
    characters: RiverCharacter[];
    /** 捕食关系表：[捕食者 id, 猎物 id]，同岸且无人看管即失败。 */
    conflicts: Array<readonly [string, string]>;
    /** 农夫之外船可载的乘客席位数。 */
    passengerSlots: number;
}
/**
 * 五关递进：狼羊菜 → 狮羊 → 三对冲突链（大船）→ 特殊大船关（五角色
 * 四冲突）→ 自定义组合。注：容量 1（仅农夫、零乘客）对任何非空角色表
 * 都无解（角色永远无法离岸），故特殊容量关以“大船 + 更密冲突表”实现。
 */
export declare const LEVELS: readonly RiverLevel[];
/** 岸侧。 */
export type Side = 'left' | 'right';
/** 游戏状态：两岸成员 + 船位 + 已上船乘客。全部为不可变快照。 */
export interface RiverState {
    /** 左岸角色 id 列表。 */
    left: string[];
    /** 右岸角色 id 列表。 */
    right: string[];
    /** 船（和农夫）当前停靠的岸。 */
    boatSide: Side;
    /** 已上船、待渡河的乘客 id（仍视为在停靠岸的看管之下）。 */
    boat: string[];
}
/**
 * 取关卡定义（越界收敛到首 / 末关）。
 * @param index 0 起的关卡下标。
 */
export declare function levelFor(index: number): RiverLevel;
/**
 * 某关开局：全体角色在左岸，船停左岸，船上为空。
 * @param levelIndex 0 起的关卡下标。
 */
export declare function createInitialState(levelIndex: number): RiverState;
/** 船停靠岸的角色列表（乘客仍留在该岸名单外，由船上名单表达）。 */
export declare function dockedBank(state: RiverState): string[];
/**
 * 角色能否上船：必须停在角色所在岸，且船上还有空位。
 * @param state 当前状态。
 * @param level 关卡定义（提供席位数）。
 * @param id 角色 id。
 */
export declare function canBoard(state: RiverState, level: RiverLevel, id: string): boolean;
/**
 * 角色上船（从停靠岸移入船舱）。
 * @returns 新状态；船上满员或角色不在停靠岸时返回 null，入参不被修改。
 */
export declare function board(state: RiverState, level: RiverLevel, id: string): RiverState | null;
/**
 * 角色能否下船：只有船舱里的角色可以下船（回到停靠岸）。
 * @param id 角色 id。
 */
export declare function canDisembark(state: RiverState, id: string): boolean;
/**
 * 角色下船（船舱移回停靠岸）。
 * @returns 新状态；角色不在船上时返回 null，入参不被修改。
 */
export declare function disembark(state: RiverState, id: string): RiverState | null;
/**
 * 能否开船：船在岸边即可开（允许空船，农夫独自摆渡是经典解法的一步）。
 */
export declare function canCross(state: RiverState): boolean;
/**
 * 开船渡河：船翻转到对岸，乘客全部卸到对岸。方向由当前 boatSide 决定。
 * @returns 新状态（左岸 / 右岸名单与 boatSide 已更新）。
 */
export declare function cross(state: RiverState): RiverState;
/**
 * 岸上冲突判定：按关卡冲突表找出第一对同岸的捕食者 / 猎物。
 * @param level 关卡定义（冲突表）。
 * @param bank 岸上角色 id 列表。
 * @returns [捕食者, 猎物]；无冲突返回 null。
 */
export declare function bankConflict(level: RiverLevel, bank: readonly string[]): readonly [string, string] | null;
/** 局面判定结果。 */
export type RiverStatus = {
    phase: 'playing';
} | {
    phase: 'failed';
    bank: Side;
    pair: readonly [string, string];
} | {
    phase: 'won';
};
/**
 * 判定当前局面：左岸清空即胜利（此时船必在右岸且已卸货）；船不在的岸
 * （无人看管）出现冲突对即失败，回报冲突对与事发岸。
 * @param state 当前状态。
 * @param level 关卡定义。
 */
export declare function evaluate(state: RiverState, level: RiverLevel): RiverStatus;
/**
 * BFS 求某关最少渡河次数（同时充当可解性证明）。
 * 农夫与船同体：从停靠岸选至多 passengerSlots 名乘客开船，离岸后原岸
 * 无人看管必须无冲突；对岸因农夫到达恒为安全。
 * @param levelIndex 0 起的关卡下标。
 * @returns 最少渡河次数；无解返回 -1。
 */
export declare function minCrossings(levelIndex: number): number;
