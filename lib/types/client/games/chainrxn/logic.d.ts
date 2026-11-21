/**
 * 连锁反应 ChainRxN 纯逻辑：矩形场地内 40-80 个缓慢漂移的 orb，玩家每关
 * 固定点击次数，点击产生扩张爆波；被波及的 orb 引爆并产生半径 = 自身
 * 半径 × 3.5 的新爆波，逐层连锁。第 n 层引爆得 10×n 分；总引爆数达标
 * 过关，剩余点击折算加分；第 4 关起加入吸收爆波的钢球。全部随机走注入
 * seed（mulberry32），漂移为确定性物理，固定步长 step 可逐帧重放。
 */
/** 逻辑画布尺寸（与渲染共用）。 */
export declare const W = 640;
export declare const H = 460;
/** 场地内框（orb 漂移与反弹边界；HUD 与提示行留在外侧）。 */
export declare const FIELD: {
    readonly left: 16;
    readonly top: 48;
    readonly right: number;
    readonly bottom: number;
};
/** 玩家点击产生的初始爆波最大半径。 */
export declare const PLAYER_BLAST_R = 30;
/** orb 爆波半径 = 自身半径 × 该系数。 */
export declare const BLAST_SCALE = 3.5;
/** 爆波扩张速度（px/秒）。 */
export declare const EXPAND_SPEED = 130;
/** 爆波到最大半径后的滞留秒数（保证连锁窗口，随后消失）。 */
export declare const LINGER_S = 0.25;
/** 每层引爆的基础分（第 n 层得 10×n）。 */
export declare const LAYER_BASE = 10;
/** 过关时每个剩余点击的折算分。 */
export declare const CLICK_BONUS = 25;
/** 固定模拟步长（秒）；index 层按此步长逐帧推进，保证可重放。 */
export declare const FIXED_DT: number;
/** 单个关卡参数。 */
export interface Level {
    /** 漂移 orb 数量。 */
    orbCount: number;
    /** 过关所需的总引爆数。 */
    goal: number;
    /** 本关点击次数。 */
    clicks: number;
    /** 钢球数量（吸收爆波、不可引爆）。 */
    steel: number;
}
/** 5 关递进：orb 更多 / 目标更高 / 点击更少，第 4 关起加入钢球。 */
export declare const LEVELS: readonly Level[];
/** 场上圆球：可引爆的 orb 或吸收爆波的钢球。 */
export interface Orb {
    id: number;
    x: number;
    y: number;
    r: number;
    vx: number;
    vy: number;
    kind: 'orb' | 'steel';
    alive: boolean;
}
/** 一个正在扩张 / 滞留的爆波。 */
export interface Blast {
    x: number;
    y: number;
    /** 当前半径（扩张中）。 */
    r: number;
    /** 最大半径。 */
    maxR: number;
    /** 连锁层：玩家点击为 0，被第 n 层爆波引爆的 orb 为 n+1。 */
    depth: number;
    /** 到达最大半径后的剩余滞留秒数。 */
    linger: number;
    alive: boolean;
}
/** 一次引爆事件（渲染粒子 / 测试断言用）。 */
export interface Ignition {
    x: number;
    y: number;
    /** 连锁层（第 n 层）。 */
    layer: number;
    /** 本次得分 10×layer。 */
    gain: number;
}
/** 单步模拟结果事件。 */
export interface StepEvent {
    /** 本步被引爆的 orb（按处理顺序）。 */
    ignited: Ignition[];
    /** 本步被钢球吸收掉的爆波数。 */
    absorbed: number;
}
/** 一局状态：跨关累计 score，phase 标记当前阶段。 */
export interface ChainRxnState {
    levelIndex: number;
    level: Level;
    orbs: Orb[];
    blasts: Blast[];
    clicksLeft: number;
    /** 本关已引爆 orb 数。 */
    exploded: number;
    /** 跨关累计总分。 */
    score: number;
    phase: 'aim' | 'chain' | 'won' | 'lost' | 'cleared';
    /** 关卡种子基值（重开 / 下一关按关卡序号派生）。 */
    baseSeed: number;
}
/**
 * mulberry32 确定性伪随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/**
 * 构造单个圆球（测试与生成共用）。
 * @param id - 唯一序号。
 * @param x - 圆心 x。
 * @param y - 圆心 y。
 * @param r - 半径。
 * @param vx - x 向速度 px/秒。
 * @param vy - y 向速度 px/秒。
 * @param kind - 'orb' 可引爆 / 'steel' 钢球。
 * @returns 新圆球（存活状态）。
 */
export declare function makeOrb(id: number, x: number, y: number, r: number, vx: number, vy: number, kind: 'orb' | 'steel'): Orb;
/**
 * 生成某一关的初始盘面（seed 决定 orb 位置 / 半径 / 漂移方向）。
 * @param levelIndex - 关卡序号（0 起）。
 * @param baseSeed - 种子基值。
 * @returns 新关卡状态（phase 'aim'，score 归 0）。
 */
export declare function createLevelState(levelIndex: number, baseSeed: number): ChainRxnState;
/**
 * 在指定位置引爆一次点击（玩家初始爆波，层 0）。
 * @param state - 当前状态。
 * @param x - 点击 x。
 * @param y - 点击 y。
 * @returns 是否成功消耗一次点击（终局或次数耗尽返回 false）。
 */
export declare function fire(state: ChainRxnState, x: number, y: number): boolean;
/**
 * 推进一帧模拟：漂移 → 爆波扩张 / 滞留 → 钢球吸收 → 引爆连锁 →
 * 终局判定（爆波全部消失时按目标 / 剩余点击结算）。
 * @param state - 当前状态（原地变更）。
 * @param dt - 步长秒数（重放须用相同步长序列）。
 * @returns 本步事件（引爆列表与吸收数）。
 */
export declare function step(state: ChainRxnState, dt: number): StepEvent;
/**
 * 是否处于终局阶段（won / lost / cleared）；用函数取值可避免属性窄化
 * 掩盖 step 中的相位变更。
 * @param phase - 当前相位。
 * @returns 终局返回 true。
 */
export declare function isTerminal(phase: ChainRxnState['phase']): boolean;
/**
 * 过关后进入下一关（保留累计 score；最后一关过关进入通关态）。
 * @param state - 当前状态（须处于 'won'）。
 * @returns 是否成功推进（非过关态返回 false）。
 */
export declare function nextLevel(state: ChainRxnState): boolean;
