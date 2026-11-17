/**
 * 魔方 Rubik 纯逻辑：3×3×3 六面 54 贴纸状态、几何法层旋转置换、
 * seed 打乱、复原判定与「按历史逆序回拧」提示。全部为确定性函数——
 * 无 DOM、无计时器；随机只经注入的 mulberry32 seed 进入。
 *
 * 表示：Cube = number[54]，下标 = faceIndex*9 + r*3 + c，值为颜色
 * （复原态下面 f 的九格颜色均为 f）。面序 U,D,L,R,F,B 对应 0..5。
 *
 * 层旋转不用手写 18 张置换表，而是把每张贴纸映射为 (cubie 坐标,
 * 面法向量) 的三维几何量，绕轴旋转 90° 后反查目标下标——正确性由
 * 构造保证，测试再按环迁移语义逐面验证。
 */
/** 面名（也是转轴记号的字母）。 */
export type FaceName = 'U' | 'D' | 'L' | 'R' | 'F' | 'B';
/** 六面的固定顺序；颜色编号即面下标。 */
export declare const FACES: readonly FaceName[];
/** 54 贴纸颜色数组（值 0..5）。 */
export type Cube = number[];
/** 一次层旋转：id 形如 'U0'（面字母 + 层号 0..2），turns 为 90° 步数（1 顺时针，-1 逆时针，模 4）。 */
export interface Move {
    id: string;
    turns: number;
}
/** 全部 18 个基础走法 id（6 面 × 3 层，层 0 为该面外层）。 */
export declare const MOVE_IDS: readonly string[];
/** 解析走法 id → { face, layer }；非法 id 抛错（配置性输入，尽早失败）。 */
export declare function parseMoveId(id: string): {
    face: FaceName;
    layer: number;
};
/**
 * 对魔方执行层旋转（纯函数）。
 * @param cube - 当前状态。
 * @param id - 走法 id（如 'F2' 表示 F 面数第 3 层）。
 * @param turns - 顺时针 90° 步数，可为负（逆时针）；模 4 归一。
 * @returns 新 Cube，入参不变。
 */
export declare function applyMove(cube: Cube, id: string, turns?: number): Cube;
/** 该走法涉及的贴纸下标集合（转层内全部贴纸；渲染高亮用，也可测置换覆盖）。 */
export declare function layerIndices(id: string): readonly number[];
/** 复原态：面 f 的九格颜色均为 f。 */
export declare function solvedCube(): Cube;
/** 复原判定：每面九格纯色（不要求等于复原配色，纯色即过关）。 */
export declare function isSolved(cube: Cube): boolean;
/**
 * 面上箭头 → 等价层旋转：行箭头绕行的变化轴转层，列箭头绕列的变化轴转层；
 * 方向按「贴纸初始位移与箭头指向一致」用 ω×q 点乘判定。
 * @param face - 箭头所在面。
 * @param axis - 'row'（左右边缘箭头）或 'col'（上下边缘箭头）。
 * @param index - 行号或列号 0..2。
 * @param dir - 箭头指向：行 +1 向右 / -1 向左；列 +1 向下 / -1 向上。
 * @returns 等价走法（id + turns）。
 */
export declare function arrowMove(face: FaceName, axis: 'row' | 'col', index: number, dir: number): Move;
/** 确定性 mulberry32 PRNG（沿 tests/pipes-logic.spec.ts 先例）。 */
export declare function mulberry32(seed: number): () => number;
/** 第 level 关的打乱步数：6 起步，每关 +1.5 取整，封顶 12。 */
export declare function scrambleCount(level: number): number;
/**
 * seed 确定的打乱走法序列：从 18 个基础走法中逐步抽取，禁止同面连续
 * （避免相邻抵消），且结果不得已是复原态。
 * @param seed - 注入的随机种子。
 * @param level - 关卡（决定步数）。
 * @returns 打乱走法 id 列表（每步顺时针一次）。
 */
export declare function scrambleMoves(seed: number, level: number): string[];
/** 一局的可测状态机快照（index.ts 持有并驱动）。 */
export interface RubikState {
    /** 54 贴纸颜色。 */
    cube: Cube;
    /** 当前关卡 1..5。 */
    level: number;
    /** 打乱序列（也是已知复原步数上界）。 */
    scramble: readonly string[];
    /** 全部已执行走法（打乱在前）；提示按其逆序回拧。 */
    history: readonly Move[];
    /** 玩家步数（含提示步）。 */
    moves: number;
    /** 已用提示次数。 */
    hintsUsed: number;
    /** 提示上限。 */
    readonly maxHints: number;
    /** 是否已复原（过关后冻结）。 */
    solved: boolean;
}
/**
 * 开新局：从复原态执行 seed 打乱。
 * @param seed - 注入的随机种子（确定性）。
 * @param level - 关卡号。
 */
export declare function newGame(seed: number, level: number): RubikState;
/**
 * 玩家拧一层：记录历史、步数 +1，并更新复原判定（过关后拒绝输入）。
 * @param state - 当前状态。
 * @param id - 走法 id。
 * @param turns - 90° 步数（1 或 -1）。
 * @returns 新状态；入参不变。
 */
export declare function userMove(state: RubikState, id: string, turns: number): RubikState;
/**
 * 下一步提示 = 历史末条的逆走法（等价于对打乱逆序回拧：先撤销玩家自
 * 己的最后一步，再逐步撤销打乱），保证沿提示走必达复原。
 * @param state - 当前状态。
 * @returns 建议走法，或 null（历史已空 / 复原 / 提示用尽时交给调用方判定）。
 */
export declare function hintMove(state: RubikState): Move | null;
/**
 * 执行提示：弹掉历史末条并施加其逆走法（步数 +1、提示计数 +1）。
 * 提示用尽或已复原时原样返回。
 * @param state - 当前状态。
 * @returns 新状态；入参不变。
 */
export declare function applyHint(state: RubikState): RubikState;
/**
 * 序列化：54 位数字串（每格颜色 0..5）。
 * @param cube - 待序列化状态。
 */
export declare function serializeCube(cube: Cube): string;
/**
 * 反序列化：仅接受 54 位、字符均在 0..5 的串。
 * @param text - 候选串。
 * @returns Cube，或 null（格式非法）。
 */
export declare function parseCube(text: string): Cube | null;
