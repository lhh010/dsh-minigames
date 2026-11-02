/**
 * 21点渲染器：绿呢赌桌、牌靴与弃牌堆、庄家暗牌翻牌动画、筹码叠、
 * 操作按钮与下注档、结算浮字、HUD（牌靴余量/余额/局数）与破产遮罩。
 * 全部为纯 canvas 绘制，状态由 index.ts 传入（见 BlackjackView）。
 */
import { type BlackjackState } from './logic.ts';
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
/** 同手牌横向偏移 px。 */
export declare const CARD_GAP = 24;
/** 两手间距 px。 */
export declare const HAND_GAP = 40;
/** 庄家手牌区中心 y。 */
export declare const DEALER_Y = 96;
/** 玩家手牌区 y（牌顶）。 */
export declare const PLAYER_Y = 330;
/** 按钮行 y。 */
export declare const BTN_Y: number;
/** 单个按钮宽 px。 */
export declare const BTN_W = 128;
/** 按钮高 px。 */
export declare const BTN_H = 40;
/** 按钮间距 px。 */
export declare const BTN_GAP = 14;
/** 下注档筹码行 y。 */
export declare const CHIP_Y: number;
/** 结算浮字（age/maxAge 均为 ms）。 */
export interface FloatText {
    text: string;
    x: number;
    y: number;
    color: string;
    age: number;
    maxAge: number;
}
/** 一次渲染所需的全部状态。 */
export interface BlackjackView {
    state: BlackjackState;
    /** 庄家暗牌翻开进度 0-1（1 为完全翻开）。 */
    flip: number;
    floats: FloatText[];
    paused: boolean;
    /** >0 时显示破产重发遮罩（秒）。 */
    rebuyFlash: number;
}
/** 按钮定义（从左到右固定五档）。 */
export interface ButtonDef {
    id: 'hit' | 'stand' | 'double' | 'bet' | 'deal';
    label: string;
    enabled: boolean;
}
/** 第 i 个按钮的矩形。 */
export declare function buttonRect(id: ButtonDef['id'], index: number): {
    x: number;
    y: number;
    w: number;
    h: number;
};
/** 命中测试：返回按钮 id，未命中返回 null。 */
export declare function hitButton(x: number, y: number): ButtonDef['id'] | null;
/** 命中测试：下注档筹码行，返回档索引，未命中返回 -1。 */
export declare function hitChip(x: number, y: number): number;
/** 第 i 手（共 n 手）的牌区中心 x。 */
export declare function handX(index: number, count: number): number;
/** 金额 → 面额筹码叠（从大到小、从左到右堆叠）。 */
export declare function drawChipStack(ctx: CanvasRenderingContext2D, cx: number, baseY: number, amount: number): void;
/** 主渲染入口。 */
export declare function renderBlackjack(ctx: CanvasRenderingContext2D, view: BlackjackView): void;
