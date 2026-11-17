/**
 * 疯狂八号渲染器：绿呢牌桌、对方牌背与张数、中央牌堆与弃牌顶（含
 * 宣告花色徽记）、己方手牌扇形（可出牌亮边、不可出牌压暗）、出 8 时
 * 的花色选择器、局分/牌堆余量 HUD 与胜负/暂停遮罩。全部为纯 canvas
 * 绘制，状态由 index.ts 传入（见 Crazy8View）；命中测试函数与绘制
 * 使用同一套布局几何，保证点哪判哪。
 */
import { type Card, type Crazy8State } from './logic.ts';
/** 逻辑画布宽度 px。 */
export declare const W = 780;
/** 逻辑画布高度 px。 */
export declare const H = 620;
/** HUD 条高度（含在 H 内）。 */
export declare const HUD_H = 40;
/** 牌面宽 px。 */
export declare const CARD_W = 64;
/** 牌面高 px。 */
export declare const CARD_H = 90;
/** 牌堆（摸牌堆）中心。 */
export declare const DRAW_X: number;
export declare const DRAW_Y = 222;
/** 弃牌堆顶中心。 */
export declare const DISCARD_X: number;
export declare const DISCARD_Y = 222;
/** 手牌扇形基线 y。 */
export declare const FAN_BASE_Y = 496;
/** 花色选择器行 y。 */
export declare const SUIT_Y = 316;
/** 一次渲染所需的全部状态。 */
export interface Crazy8View {
    state: Crazy8State;
    paused: boolean;
}
/** 花色显示颜色（红心/方块红，黑桃/梅花白）。 */
export declare function suitColor(suit: number): string;
/**
 * 手牌扇形第 index 张（共 count 张）的几何：中心点与旋转角。
 * @param index - 手牌下标。
 * @param count - 手牌张数。
 */
export declare function fanSlot(index: number, count: number): {
    x: number;
    y: number;
    angle: number;
};
/**
 * 命中测试：手牌扇形（视觉最上层优先），返回手牌下标，未命中 -1。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 * @param count - 手牌张数。
 */
export declare function hitHand(x: number, y: number, count: number): number;
/**
 * 命中测试：摸牌堆（无牌可出时点击摸牌）。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 */
export declare function hitDrawPile(x: number, y: number): boolean;
/**
 * 命中测试：花色选择器，返回花色 0-3，未命中 -1。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 */
export declare function hitSuit(x: number, y: number): number;
/**
 * 牌面（中心 cx/cy、旋转 angle）；highlight 时描亮边，dim 时压暗。
 */
export declare function drawCardFace(ctx: CanvasRenderingContext2D, card: Card, cx: number, cy: number, angle?: number, highlight?: boolean, dim?: boolean): void;
/**
 * 绘制完整一帧。
 * @param ctx - 画布上下文（逻辑坐标已由 fitCanvas 设置）。
 * @param view - 状态与暂停标记。
 */
export declare function renderCrazy8(ctx: CanvasRenderingContext2D, view: Crazy8View): void;
