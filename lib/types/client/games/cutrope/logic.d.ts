/**
 * 剪绳喂糖 (CutRope) 纯逻辑层。糖果系在 1-3 根绳上（弹簧质点链 +
 * Verlet 积分的悬垂物理），玩家点击/划线剪断绳子让糖果摆动、坠落，
 * 最终掉进小怪物嘴里过关；途中可顺路收集星星加分，碰到尖刺糖果
 * 即碎、掉出界或带气泡飞出顶部同样判负（共用 3 条命），限剪次数
 * 用尽仍未喂到也判负。
 *
 * 物理为确定性固定子步（SUBSTEP_HZ）：绳是等分段质点链（锚点端
 * 固定，末端与糖果共享节点，糖果一侧校正权重更大模拟重物），剪断
 * 后绳段保留内部约束自由垂落（渲染层播放“弹开”动画）；糖果本身
 * 也是 Verlet 质点，进气泡后受恒定浮力（可点破恢复重力）。全部
 * 运算是纯浮点 + 注入 seed（mulberry32，仅用于剪断冲量的微扰动），
 * 同 seed 同输入逐位一致，可确定性重放。
 */
export declare const W = 640;
export declare const H = 440;
/** 地面（糖果落地面即视为错失机会，进入静止超时判负）。 */
export declare const GROUND_Y = 400;
export declare const GRAVITY = 1400;
/** 气泡浮力（向上的加速度，略小于重力的一半，先沉后缓升）。 */
export declare const BUOY = 700;
/** 固定物理子步频率。 */
export declare const SUBSTEP_HZ = 120;
/** 每子步绳约束迭代次数。 */
export declare const ROPE_ITER = 10;
export declare const ROPE_DAMP = 0.995;
export declare const CANDY_DAMP = 0.999;
export declare const CANDY_R = 12;
/** 小怪物嘴捕获半径。 */
export declare const MOUTH_R = 26;
export declare const STAR_R = 11;
export declare const BUBBLE_R = 24;
export declare const MAX_LIVES = 3;
/** 绳质点（Verlet：px/py 为上一步位置）。 */
export interface Pt {
    x: number;
    y: number;
    px: number;
    py: number;
}
export interface RopeSpec {
    ax: number;
    ay: number;
    len: number;
}
export interface SpikeSpec {
    /** 尖刺碰撞矩形（左上角 + 宽高）。 */
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface LevelSpec {
    ropes: readonly RopeSpec[];
    candy: {
        x: number;
        y: number;
    };
    monster: {
        x: number;
        y: number;
    };
    stars: readonly {
        x: number;
        y: number;
    }[];
    spikes?: readonly SpikeSpec[];
    bubble?: {
        x: number;
        y: number;
    };
    cuts: number;
}
/** 运行时绳：cut 后仍保留质点链自由垂落（渲染弹开动画）。 */
export interface RopeRT {
    ax: number;
    ay: number;
    rest: number;
    cut: boolean;
    pts: Pt[];
}
export interface Candy {
    x: number;
    y: number;
    px: number;
    py: number;
}
export interface BubbleState {
    x: number;
    y: number;
    onCandy: boolean;
    popped: boolean;
}
export type CutRopeEvent = {
    type: 'cut';
    x: number;
    y: number;
} | {
    type: 'star';
    x: number;
    y: number;
} | {
    type: 'shatter';
    x: number;
    y: number;
} | {
    type: 'bubble';
    x: number;
    y: number;
} | {
    type: 'pop';
    x: number;
    y: number;
} | {
    type: 'win';
    stars: number;
} | {
    type: 'fail';
    reason: 'fell' | 'spike' | 'flew' | 'starved';
};
export type Phase = 'play' | 'won' | 'lost';
export interface CutRopeState {
    seed: number;
    level: number;
    phase: Phase;
    lives: number;
    cutsLeft: number;
    ropes: RopeRT[];
    candy: Candy;
    monster: {
        x: number;
        y: number;
    };
    stars: {
        x: number;
        y: number;
        got: boolean;
    }[];
    spikes: SpikeSpec[];
    bubble: BubbleState | null;
    /** 静止累计 ms（错失判负计时）。 */
    stillMs: number;
    timeMs: number;
    events: CutRopeEvent[];
    /** 注入的确定性随机源（剪断冲量微扰动用）。 */
    rng: () => number;
}
/** mulberry32 PRNG：小、快、确定性。 */
export declare function mulberry32(seed: number): () => number;
/**
 * 5 关递进：1 绳直落 → 2 绳摆荡 → 2 绳 + 地面尖刺逼抛物线 →
 * 气泡浮空 + 高台怪物 → 3 绳 + 气泡 + 尖刺（左路长程飞行）。
 */
export declare const LEVELS: readonly LevelSpec[];
/** 开一关（lives 由调用方跨关延续）。 */
export declare function createCutRope(seed: number, level: number, lives?: number): CutRopeState;
/** 推进一帧：内部按 SUBSTEP_HZ 固定子步，同输入逐位确定。 */
export declare function stepCutRope(state: CutRopeState, dtMs: number): void;
/** 线段相交判定（剪绳命中 + 测试用）。 */
export declare function segmentsIntersect(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): boolean;
/**
 * 剪绳：剪刀线段穿过第一根相交的未剪绳（一次剪一根），消耗一次
 * 剪数；剪断点质点获得由 seed 决定的微小侧向冲量（确定性弹开）。
 * @returns 命中并剪断时为 true。
 */
export declare function cutRopeAt(state: CutRopeState, x1: number, y1: number, x2: number, y2: number): boolean;
/** 点破气泡（点击落在气泡范围内）。 */
export declare function popBubbleAt(state: CutRopeState, x: number, y: number): boolean;
/** 糖果瞬时速度（px/s，测试与错失判定用）。 */
export declare function candySpeed(state: CutRopeState): number;
