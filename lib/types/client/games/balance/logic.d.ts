/**
 * 天平谜题 Balance 纯逻辑：一根中心支点横梁，左右各 5 个挂点（距支点
 * 1-5 单位）。全部砝码挂上后左力矩和等于右力矩和即过关。仅含确定性
 * 纯函数——无 DOM、无定时器；随机性全部经由注入的 rng（mulberry32）。
 */
/** 每侧挂点数（距支点 1..SLOTS_PER_SIDE 单位）。 */
export declare const SLOTS_PER_SIDE = 5;
/** 总挂点数：左 5 + 右 5，0..4 为左侧（距离 5..1），5..9 为右侧（距离 1..5）。 */
export declare const SLOT_COUNT: number;
/** 每关砝码数（关卡 1..5 递进：3 → 7）。 */
export declare const LEVEL_WEIGHTS: number[];
/** 一局棋面：weights 按砝码下标给出数值（1-9），placement 给出所在挂点（-1 = 未挂）。 */
export interface BalanceState {
    weights: number[];
    placement: number[];
}
/** 一个关卡：砝码数值与构造时保证存在的一组解（每个砝码的挂点）。 */
export interface BalanceLevel {
    weights: number[];
    /** 解：solution[砝码下标] = 挂点下标，按此挂满恰好平衡。 */
    solution: number[];
}
/**
 * mulberry32 确定性伪随机数生成器：返回 [0,1) 的函数，同种子同序列。
 * @param seed - 非负整数种子。
 */
export declare function mulberry32(seed: number): () => number;
/** 挂点所在的侧与力臂：0..4 为左（力臂 5..1），5..9 为右（力臂 1..5）。 */
export declare function slotArm(slot: number): {
    side: 'L' | 'R';
    distance: number;
};
/** 左力矩和：已挂在左侧的 砝码数值 × 力臂 之和。 */
export declare function leftTorque(state: BalanceState): number;
/** 右力矩和：已挂在右侧的 砝码数值 × 力臂 之和。 */
export declare function rightTorque(state: BalanceState): number;
/** 净力矩：左 - 右；正数左沉，负数右沉，0 恰平衡。 */
export declare function netTorque(state: BalanceState): number;
/** 是否全部砝码均已挂上。 */
export declare function allPlaced(state: BalanceState): boolean;
/** 过关判定：全部挂上且净力矩为 0。 */
export declare function isWin(state: BalanceState): boolean;
/** 开局：给定砝码数值，全部置于砝码架（未挂）。 */
export declare function createStart(weights: number[]): BalanceState;
/** 占用情况：occupants[挂点] = 砝码下标，-1 = 空。 */
export declare function occupants(state: BalanceState): number[];
/**
 * 把砝码 wi 挂到挂点 slot。
 * @returns 新状态；wi 越界、已挂上、slot 越界或已被占用时返回 null。不改动原状态。
 */
export declare function placeWeight(state: BalanceState, wi: number, slot: number): BalanceState | null;
/**
 * 取下已挂上的砝码 wi 放回砝码架。
 * @returns 新状态；wi 越界或本来未挂时返回 null。不改动原状态。
 */
export declare function removeWeight(state: BalanceState, wi: number): BalanceState | null;
/**
 * 生成一个保证恰好可解的关卡（构造解反推）：先把前 count-1 个砝码随机
 * 挂到随机挂点上，得到左右力矩差 diff（diff 为 0 时重试）；再用最后一
 * 个砝码补平——在较轻一侧找一个空闲挂点 d，使 diff 能被 d 整除且商在
 * 1..9。找不到则整体重试，重试上限后回退到确定性可解组。
 * @param rng - 注入的 [0,1) 随机源（如 mulberry32(seed)）。
 * @param count - 砝码数（1..10）。
 * @returns 砝码数值与其一组平衡解；同 rng 序列结果确定。
 */
export declare function generateLevel(rng: () => number, count: number): BalanceLevel;
/** 关卡 seed 派生：同一基础种子下每关固定不同。 */
export declare function levelSeed(baseSeed: number, level: number): number;
