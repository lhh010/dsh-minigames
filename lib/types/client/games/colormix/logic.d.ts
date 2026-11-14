/**
 * 调色大师纯逻辑：红/黄/蓝滴剂按通道线性平均混合、欧氏色差、阈值
 * 判定、计分与种子关卡生成（从原色比例反推目标色，天然可解）。
 * 全部为确定性纯函数，随机只走注入的 mulberry32 种子。
 */
/** mulberry32 种子随机数发生器（确定性，[0, 1)）。 */
export declare function mulberry32(seed: number): () => number;
/** 一格 RGB 颜色（各通道 0..255）。 */
export type RGB = readonly [number, number, number];
/** 三原色滴剂：红 / 黄 / 蓝（色号 0 / 1 / 2）。 */
export declare const PRIMARIES: readonly RGB[];
/** 一关的难度参数。 */
export interface LevelConfig {
    /** 显示用短标签。 */
    label: string;
    /** 本关滴数上限。 */
    maxDrops: number;
    /** 过关色差阈值（欧氏距离，越小越难）。 */
    threshold: number;
}
/** 五关递进：滴数收紧、阈值逐关收窄。 */
export declare const LEVELS: readonly LevelConfig[];
/**
 * 混合累积平均：所有已滴滴剂按通道线性平均后四舍五入。
 * @param drops - 已滴的原色色号序列（每个 0..2）。
 * @returns 混合色；空序列返回 [0,0,0]（表示尚未滴入，画布以空盘呈现）。
 */
export declare function mixColor(drops: readonly number[]): RGB;
/**
 * 两色的欧氏距离（RGB 三通道方差和开方）。
 * @returns 距离，0..442（黑白极值约 441.67）。
 */
export declare function colorDistance(a: RGB, b: RGB): number;
/**
 * 过关判定：色差不超过阈值（含等号——恰好压线也算过）。
 * @param distance - 当前混合与目标的色差。
 * @param threshold - 本关阈值。
 */
export declare function isWithinThreshold(distance: number, threshold: number): boolean;
/**
 * 过关计分：基础 100 + 剩余滴数奖励（每滴 30，鼓励压线少用）+ 精度奖励
 * （色差越贴近 0 越高，至多 50）。
 * @param distance - 过关时的色差（须 ≤ threshold）。
 * @param threshold - 本关阈值。
 * @param remaining - 提前达标时省下的滴数。
 * @returns 本关得分。
 */
export declare function scoreFor(distance: number, threshold: number, remaining: number): number;
/**
 * 目标色的中文名（展示用）：按 HSV 色相分桶，低饱和归灰。
 * @param rgb - 目标色。
 * @returns 红/橙/黄/绿/青/蓝/紫/粉/灰 之一。
 */
export declare function nameFor(rgb: RGB): string;
/** 一关的完整出题结果。 */
export interface LevelRound {
    /** 目标色（恰等于 recipe 的混合结果，可解）。 */
    target: RGB;
    /** 目标色名称（展示用）。 */
    name: string;
    /** 反推出目标色的滴剂序列（每项 0..2）。 */
    recipe: number[];
    /** 本关难度。 */
    config: LevelConfig;
}
/**
 * 用种子确定性出一关：先随机一条 2..(maxDrops-1) 滴的配方（保证至少
 * 两种原色参与、且至少剩 1 滴余量），再取配方混合为目标色——目标永远
 * 可以在滴数上限内零误差复现。
 * @param seed - 整数种子（同种子同关）。
 * @param levelIdx - 关卡下标（0..LEVELS.length-1）。
 */
export declare function makeLevel(seed: number, levelIdx: number): LevelRound;
