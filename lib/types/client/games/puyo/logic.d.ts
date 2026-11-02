/**
 * 噗呦噗呦纯逻辑引擎：6×12 井、成对噗呦下落（含踢墙旋转）、四连通同色
 * ≥4 消除、重力压实、连锁计分与溢出判定。全部为纯函数/纯状态机，不依赖
 * DOM，可直接单测。
 *
 * 计分规则：每次消除得分 = 消除数 × 10 × chain²（chain 从 1 起）。
 * 溢出规则：落定后第 0 行（井顶）有任何噗呦、或出生点被占，即判负。
 */
/** 井宽（列数）。 */
export declare const COLS = 6;
/** 井高（行数），第 0 行为井顶。 */
export declare const ROWS = 12;
/** 噗呦颜色种数（1..COLOR_COUNT，0 表示空）。 */
export declare const COLOR_COUNT = 4;
/** 出生列（轴噗呦固定落点）。 */
export declare const SPAWN_X = 2;
/** 自然下落一格的毫秒数。 */
export declare const FALL_MS = 750;
/** 软降一格的毫秒数。 */
export declare const SOFT_MS = 45;
/** 触底后到锁定的宽限毫秒数（便于最后微调）。 */
export declare const LOCK_MS = 260;
/** 消除特效时长（毫秒）。 */
export declare const FX_MS = 300;
/** 棋盘：ROWS×COLS 的颜色矩阵，0 为空。 */
export type Board = number[][];
/** mulberry32 的可变种子状态。 */
export interface RngState {
    s: number;
}
/**
 * 构造 mulberry32 随机源：同一 (seed, round) 永远产生同一序列。
 * @param seed - 局种子。
 * @param round - 局号（重开递增），混入后每局序列不同。
 * @returns 可被 {@link rngNext} 推进的随机源。
 */
export declare function mulberry32(seed: number, round: number): RngState;
/** 推进随机源并返回 [0,1) 的下一个值。 */
export declare function rngNext(r: RngState): number;
/** 取 [0, n) 的随机整数。 */
export declare function rngInt(r: RngState, n: number): number;
/** 一对即将下落的噗呦颜色。 */
export interface PuyoPair {
    a: number;
    b: number;
}
/** 从随机源取下一对颜色。 */
export declare function rngPair(r: RngState): PuyoPair;
/** 下落中的噗呦对：轴 (x,y) + 按旋转态偏移的副噗呦。 */
export interface PuyoPiece extends PuyoPair {
    x: number;
    y: number;
    rot: number;
}
/**
 * 旋转态 0..3 的副噗呦相对轴的偏移：上、左、下、右（↑ 顺时针旋转）。
 * @param rot - 旋转态（任意整数，取模归一）。
 */
export declare function childOffset(rot: number): [number, number];
/** 噗呦对占据的两格：[轴, 副]。 */
export declare function pieceCells(p: PuyoPiece): Array<[number, number]>;
/** 空棋盘。 */
export declare function createBoard(): Board;
/** 深拷贝棋盘。 */
export declare function cloneBoard(b: Board): Board;
/**
 * (x,y) 是否可放：列越界或触底为不可放；y<0 视为井口上方的隐藏区，可放。
 */
export declare function cellFreeAt(b: Board, x: number, y: number): boolean;
/** 噗呦对整体平移 dx 后是否仍合法。 */
export declare function canMove(b: Board, p: PuyoPiece, dx: number): boolean;
/** 噗呦对还能下落几格（0 = 已触底）。 */
export declare function dropDistance(b: Board, p: PuyoPiece): number;
/**
 * 顺时针旋转一次，带踢墙：目标位非法时依次尝试整体右移、左移、上移，
 * 全部失败返回 null（保持原状）。
 * @param b - 当前棋盘。
 * @param p - 当前噗呦对。
 * @returns 旋转后的新噗呦对，或 null 表示无处可踢。
 */
export declare function rotatePiece(b: Board, p: PuyoPiece): PuyoPiece | null;
/**
 * 把噗呦对写入棋盘（y<0 的格丢弃）。
 * @returns 是否有格子被挤出井口（溢出信号之一）。
 */
export declare function lockWrite(b: Board, p: PuyoPiece): boolean;
/**
 * 重力压实：每列非空格子沉到底部。
 * @returns 发生移动的格子数（0 = 本已压实）。
 */
export declare function applyGravity(b: Board): number;
/**
 * 找出所有处于四连通同色 ≥4 组的格子。
 * @returns 待消除格子坐标列表。
 */
export declare function findClears(b: Board): Array<[number, number]>;
/** 一段消除：第 chain 连锁消掉的格子（含颜色，供特效用）与得分。 */
export interface ResolveStep {
    chain: number;
    cleared: number;
    cells: Array<{
        x: number;
        y: number;
        color: number;
    }>;
    gained: number;
}
/** resolveBoard 的完整结算结果。 */
export interface ResolveResult {
    board: Board;
    steps: ResolveStep[];
    score: number;
    cleared: number;
}
/**
 * 结算整个连锁：反复「四连通消除 → 重力压实」直到无组可消。
 * 输入棋盘不被修改，返回压实后的新棋盘。
 * @param input - 落定（已压实）的棋盘。
 */
export declare function resolveBoard(input: Board): ResolveResult;
/** 井顶（第 0 行）是否已被落定的噗呦占据——溢出判负。 */
export declare function isOverflow(b: Board): boolean;
/** 连锁浮字（井内坐标，渲染层换算像素并上浮）。 */
export interface PuyoFloat {
    x: number;
    y: number;
    text: string;
    color: string;
    life: number;
    maxLife: number;
}
/** 消除爆裂特效（生命 0..FX_MS，渲染层一次性喷粒子）。 */
export interface ClearFx {
    x: number;
    y: number;
    color: number;
    life: number;
    spawned: boolean;
}
/** 供渲染/音效消费的一次性事件（宿主每帧清空）。 */
export type PuyoEvent = {
    type: 'lock';
} | {
    type: 'clear';
    chain: number;
    cleared: number;
    gained: number;
} | {
    type: 'over';
};
/** 一局完整状态。 */
export interface PuyoState {
    board: Board;
    piece: PuyoPiece | null;
    next: PuyoPair;
    rng: RngState;
    phase: 'playing' | 'over';
    fallMs: number;
    lockMs: number;
    score: number;
    maxChain: number;
    pieces: number;
    floats: PuyoFloat[];
    clearFx: ClearFx[];
    events: PuyoEvent[];
}
/** 单帧输入：left/right/rotate 为边沿触发（宿主去重），softDrop 为按住态。 */
export interface PuyoInput {
    left: boolean;
    right: boolean;
    rotate: boolean;
    softDrop: boolean;
}
/** 无输入帧。 */
export declare const PUYO_IDLE: PuyoInput;
/**
 * 推进一帧：吃输入 → 下落/触底锁定 → 连锁结算 → 补新对。
 * @param s - 局状态（原地变更）。
 * @param dtMs - 帧间隔毫秒。
 * @param input - 本帧输入。
 */
export declare function stepPuyo(s: PuyoState, dtMs: number, input?: PuyoInput): void;
/**
 * 开新局：空井 + mulberry32(seed, round) 驱动的确定性发牌。
 * @param seed - 局种子。
 * @param round - 局号（重开递增）。
 */
export declare function createPuyoState(seed: number, round: number): PuyoState;
