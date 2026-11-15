/**
 * 开心农场渲染层：等距视角田块（颜色随状态）、作物三阶段图（苗→半熟→
 * 熟，成熟果实闪烁）、天气横幅（雨滴下落/太阳射线动画）、市场价格条形
 * 走势、底部作物卡（点击购买并选中）、金钱/天数/目标 HUD 与过关遮罩。
 * 基于共享主题工具，纯 canvas 绘制；观察金钱增长触发收获粒子。
 */
import type { CropId, FarmState } from './logic.ts';
export declare const LOGICAL_W = 760;
export declare const LOGICAL_H = 520;
/**
 * 田块等距中心点（行优先下标对应）：先把整片网格的包围盒平移到田块区
 * 中心，使不同关卡尺寸都居中。
 * @param cols - 列数。
 * @param rows - 行数。
 * @returns 每块田的中心坐标数组。
 */
export declare function tileCenters(state: FarmState): {
    x: number;
    y: number;
}[];
/**
 * 命中测试：逻辑坐标落在哪块田（菱形内判定，逐块扫 ≤30 块）。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @param state - 游戏状态。
 * @returns 田块下标，未命中返回 null。
 */
export declare function tileAt(x: number, y: number, state: FarmState): number | null;
/**
 * 命中测试：逻辑坐标点中哪张作物卡（用于购买并选中）。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @returns 作物 id，未命中返回 null。
 */
export declare function cardAt(x: number, y: number): CropId | null;
/**
 * 画整帧：背景 → HUD → 天气横幅 → 等距田块与作物 → 市场面板 → 作物卡
 * → 粒子 → 遮罩。观察金钱增长触发收获粒子。
 * @param ctx - 画布上下文。
 * @param state - 游戏状态。
 * @param paused - 是否暂停（画暂停遮罩）。
 */
export declare function renderFarm(ctx: CanvasRenderingContext2D, state: FarmState, paused: boolean): void;
