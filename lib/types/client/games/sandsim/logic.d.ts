/**
 * 落沙物语（SandSim）纯逻辑：确定性元胞自动机 + 关卡生成 + 工具交互。
 *
 * 网格自底向上、从左到右固定序扫描，配合 moved 戳记保证同一粒子每帧
 * 只结算一次——同种子同输入的逐帧结果完全一致（可重放）。所有随机
 * （斜向择向、关卡生成）都走注入的 mulberry32 种子。
 */
/** 物质编号：空 / 沙 / 水 / 油 / 岩 / 火 / 金砂 / 收集桶。 */
export declare const EMPTY = 0;
export declare const SAND = 1;
export declare const WATER = 2;
export declare const OIL = 3;
export declare const ROCK = 4;
export declare const FIRE = 5;
export declare const GOLD = 6;
export declare const BUCKET = 7;
/** 玩家工具：挖掘 / 放岩 / 放水 / 放沙。 */
export type Tool = 'dig' | 'rock' | 'water' | 'sand';
/** 逻辑画布尺寸（render 与 index 共用）。 */
export declare const LOGICAL_W = 560;
export declare const LOGICAL_H = 470;
/** CA 固定步频（每秒 30 次整格结算）。 */
export declare const STEP_DT: number;
/** 确定性伪随机：同种子产生同一 [0,1) 序列。
 * @param seed - 32 位无符号种子。
 * @returns 返回 [0,1) 浮点的生成器函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 单关配置：随关卡号递进的尺寸 / 配额 / 预算 / 火。 */
export interface LevelSpec {
    /** 1 基关卡号。 */
    level: number;
    cols: number;
    rows: number;
    /** 过关需引入桶内的金砂数。 */
    quota: number;
    /** 场上散布的金砂总数。 */
    goldTotal: number;
    /** 初始水源格数（成团放置）。 */
    waterCells: number;
    /** 挖掘次数上限。 */
    digBudget: number;
    /** 放岩次数上限。 */
    rockBudget: number;
    /** 放水次数上限（每次 1 格）。 */
    waterBudget: number;
    /** 放沙次数上限。 */
    sandBudget: number;
    /** 限时（秒）。 */
    timeLimit: number;
    /** 是否带火源障碍。 */
    hasFire: boolean;
}
/** 5 关递进配置：结构更复杂、金砂更散、后期加火源。 */
export declare const LEVELS: LevelSpec[];
/** 游戏运行态：网格 + 计数 + 进度，全部字段可被测试直接改写。 */
export interface SandSimState {
    level: number;
    seed: number;
    rows: number;
    cols: number;
    /** 物质网格 [rows][cols]，值为 EMPTY..BUCKET。 */
    grid: number[][];
    /** 火焰剩余寿命（步），与 grid 同构，仅 FIRE 格有意义。 */
    fireLife: number[][];
    /** moved 戳记：等于当前 stepStamp 的格本步已结算，跳过。 */
    moved: number[][];
    stepStamp: number;
    rng: () => number;
    collected: number;
    quota: number;
    goldTotal: number;
    goldBurned: number;
    /** 场上尚存金砂数（含桶外未收集）。 */
    goldInPlay: number;
    timeLeft: number;
    digLeft: number;
    rockLeft: number;
    waterLeft: number;
    sandLeft: number;
    /** 步进累加器（秒）。 */
    acc: number;
    won: boolean;
    over: boolean;
}
/** 生成某一关的初始状态（确定性）。
 * @param seed - 32 位种子。
 * @param levelIndex - 0 基关卡下标（LEVELS）。
 * @returns 就绪的 SandSimState（已含岩层 / 水 / 金砂 / 火源 / 桶）。
 */
export declare function createSandSimState(seed: number, levelIndex: number): SandSimState;
/** 读取网格（越界按岩处理）。
 * @param s - 游戏状态。
 * @param r - 行。
 * @param c - 列。
 */
export declare function cellAt(s: SandSimState, r: number, c: number): number;
/** 在状态上应用一次工具（无预算或目标非法时不动）。
 * @param s - 游戏状态。
 * @param r - 行。
 * @param c - 列。
 * @param tool - 工具类型。
 * @returns 是否实际改动。
 */
export declare function applyTool(s: SandSimState, r: number, c: number, tool: Tool): boolean;
/** 一次完整 CA 扫描（确定性：自底向上、从左到右）。
 * @param s - 游戏状态（原地更新）。
 */
export declare function stepOnce(s: SandSimState): void;
/** 时间驱动步进：按 STEP_DT 累积整步结算并扣倒计时。
 * @param s - 游戏状态。
 * @param dt - 本帧秒数（建议已钳制）。
 */
export declare function stepSim(s: SandSimState, dt: number): void;
/** 网格快照（可重放对比用）：每行物质编号拼成一串。
 * @param s - 游戏状态。
 */
export declare function snapshotGrid(s: SandSimState): string;
