/**
 * 吹牛骰渲染器：酒馆木桌、两方骰区（己方亮面 / 对方骰背与剩余颗数堆）、
 * 出价历史表（每口出价带概率色条）、开骰翻面动画（万能 1 金光高亮）、
 * 数量/点数选择器、出价与吹牛大按钮、局分 HUD、一局结束面板与胜负
 * 遮罩。全部为纯 canvas 绘制，状态由 index.ts 传入（见 LiarDiceView）。
 */
import { type Bid, type LiarDiceState } from './logic.ts';
/** 逻辑画布宽度 px。 */
export declare const W = 780;
/** 逻辑画布高度 px。 */
export declare const H = 620;
/** HUD 条高度（含在 H 内）。 */
export declare const HUD_H = 40;
/** 数量选择器行 y。 */
export declare const COUNT_Y = 462;
/** 点数选择器行 y。 */
export declare const FACE_Y = 512;
/** 吹牛大按钮矩形。 */
export declare const LIAR_RECT: {
    x: number;
    y: number;
    w: number;
    h: number;
};
/** 出价确认按钮矩形。 */
export declare const CONFIRM_RECT: {
    x: number;
    y: number;
    w: number;
    h: number;
};
/** 命中区域：选择器数值 / 吹牛 / 出价 / 下一局。 */
export type HitRegion = {
    kind: 'count' | 'face';
    value: number;
} | {
    kind: 'liar';
} | {
    kind: 'confirm';
} | {
    kind: 'next';
};
/** 一次渲染所需的全部状态。 */
export interface LiarDiceView {
    state: LiarDiceState;
    /** 选择器当前组合（数量 × 点数）。 */
    selected: Bid;
    /** 开骰翻面进度 0-1（>0 且有开骰记录时对方亮骰）。 */
    reveal: number;
    paused: boolean;
}
/**
 * 命中测试：数量/点数选择器、吹牛与出价按钮、下一局面板。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 * @param maxCount - 数量选择器的最大档（全场骰总数）。
 * @returns 命中区域，未命中返回 null。
 */
export declare function hitTest(x: number, y: number, maxCount: number): HitRegion | null;
/** 主渲染入口。 */
export declare function renderLiarDice(ctx: CanvasRenderingContext2D, view: LiarDiceView): void;
