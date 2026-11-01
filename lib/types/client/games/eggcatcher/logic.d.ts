/**
 * 接鸡蛋（Egg Catcher）纯逻辑：篮子沿底部横向移动（键盘步进或指针
 * 目标位插值追赶），顶部母鸡来回走动并按下落节奏下蛋。蛋分三种：
 * 普通蛋 +1、金黄蛋 +5、臭蛋碰篮 -1 命；漏接普通/金蛋也 -1 命，共 5 命。
 * 难度随回合时间升档：下落间隔缩短、速度加快、臭蛋概率上升，全部由
 * mulberry32(seed, round) 确定性驱动。同屏多蛋、微水平漂移（撞侧墙反弹）。
 * 连续接住触发连击加成（窗口 900ms，封顶 8）。时间单位毫秒，物理单位
 * px / s。输入以纯数据 Input 传入，保证同 seed + 同输入序列重放一致。
 */
/** 逻辑画布尺寸（HUD 条包含在该高度内）。 */
export declare const W = 480;
export declare const H = 600;
export declare const HUD_H = 30;
/** 篮子宽 / 高 / 缘口逻辑 y。 */
export declare const BASKET_W = 96;
export declare const BASKET_H = 34;
export declare const BASKET_Y: number;
/** 篮子平移速度 px/s（键盘步进与指针追赶同速）。 */
export declare const BASKET_SPEED = 430;
/** 初始生命。 */
export declare const START_LIVES = 5;
/** 连击窗口 ms：窗口内再接住则连击 +1。 */
export declare const COMBO_WINDOW_MS = 900;
/** 连击加成上限。 */
export declare const COMBO_CAP = 8;
/** 每级连击附加分。 */
export declare const COMBO_BONUS = 1;
/** 每 12 秒升一档难度。 */
export declare const LEVEL_MS = 12000;
/** 篮子接住时的挤压动画时长 ms。 */
export declare const SQUASH_MS = 160;
/** 母鸡走动速度 px/s。 */
export declare const HEN_SPEED = 72;
/** 蛋半径 px。 */
export declare const EGG_R = 11;
/** 飘字存活时长 ms。 */
export declare const FLOAT_MS = 800;
/**
 * mulberry32 确定性随机数发生器。
 * @param seed - 非负整数种子。
 * @returns 返回 [0,1) 均匀随机数的函数。
 */
export declare function mulberry32(seed: number): () => number;
/** 蛋种类：0 普通蛋 +1 分，1 金黄蛋 +5 分，2 臭蛋碰篮 -1 命。 */
export declare const EGG_KINDS: readonly [{
    readonly name: "普通蛋";
    readonly score: 1;
}, {
    readonly name: "金黄蛋";
    readonly score: 5;
}, {
    readonly name: "臭蛋";
    readonly score: 0;
}];
/** 一个下落中的蛋。 */
export interface Egg {
    kind: 0 | 1 | 2;
    x: number;
    y: number;
    vy: number;
    vx: number;
}
/** 顶部走动的母鸡。 */
export interface Hen {
    x: number;
    dir: 1 | -1;
}
/** 上浮渐隐的飘字（得分 / 连击提示）。 */
export interface FloatText {
    x: number;
    y: number;
    text: string;
    life: number;
}
/** 单步内产生、供渲染层消费的可视事件。 */
export type EggEvent = {
    type: 'catch';
    x: number;
    y: number;
    kind: 0 | 1 | 2;
} | {
    type: 'miss';
    x: number;
    y: number;
    kind: 0 | 1 | 2;
} | {
    type: 'rotten';
    x: number;
    y: number;
};
/** 一帧输入：键盘方向（-1/0/1）或指针目标位（逻辑 x，null 表示无指针目标）。 */
export interface EggInput {
    dir: -1 | 0 | 1;
    pointerX: number | null;
}
/** 一局游戏的完整可测状态。 */
export interface EggCatcherState {
    /** 回合内已流逝 ms。 */
    t: number;
    score: number;
    lives: number;
    missed: number;
    combo: number;
    /** 连击失效时刻 ms（回合钟）。 */
    comboExpire: number;
    /** 篮子中心 x。 */
    basketX: number;
    /** 挤压动画剩余 ms。 */
    squashMs: number;
    eggs: Egg[];
    events: EggEvent[];
    floats: FloatText[];
    rng: () => number;
    hen: Hen;
    /** 下一次下蛋时刻 ms。 */
    nextDropAt: number;
    over: boolean;
}
/**
 * 当前难度档位：随回合时间每 12 秒 +1。
 * @param tMs - 回合内毫秒钟。
 * @returns 从 1 开始的档位。
 */
export declare function levelOf(tMs: number): number;
/**
 * 下蛋间隔 ms：1 档 1400ms，每档 -130ms，下限 360ms。
 * @param level - 当前档位。
 * @returns 相邻两次下蛋的间隔毫秒。
 */
export declare function dropInterval(level: number): number;
/**
 * 蛋基础下落速度 px/s：1 档 130，每档 +26。
 * @param level - 当前档位。
 * @returns 该档位的基础下落速度。
 */
export declare function fallSpeed(level: number): number;
/**
 * 臭蛋概率：1 档 6%，每档 +1.5%，封顶 22%。
 * @param level - 当前档位。
 * @returns 该档位单颗蛋为臭蛋的概率。
 */
export declare function rottenChance(level: number): number;
/** 金黄蛋概率（不随档位变化）。 */
export declare const GOLD_CHANCE = 0.12;
/**
 * 篮子可移动的左右边界（中心 x）。
 * @returns [minX, maxX]。
 */
export declare function basketBounds(): [number, number];
/**
 * 新开一局。
 * @param seed - 外部种子（如日期）。
 * @param round - 第几局（同一 seed 的不同局轨迹不同）。
 * @returns 初始状态。
 */
export declare function createEggCatcher(seed: number, round?: number): EggCatcherState;
/**
 * 推进一帧：篮子移动（指针目标位优先、否则键盘方向）、母鸡走动、按
 * 档位下蛋、蛋物理与接住 / 漏接判定、连击与飘字。事件写入
 * state.events，调用方每帧消费后由本函数在下一帧开头清空。
 * @param state - 目标状态。
 * @param dtMs - 帧间隔 ms。
 * @param input - 本帧输入（键盘方向 / 指针目标位）。
 */
export declare function stepEggCatcher(state: EggCatcherState, dtMs: number, input: EggInput): void;
