/**
 * 成语接龙 IdiomChain 画布渲染：卷轴式上一成语展示（尾字红字高亮）、
 * AI 出牌行（滑入动画）、6 张手牌候选（成语+简注，可接者亮边发光）、
 * 跳过按钮、链长/分数/局数/倒计时 HUD、暂停与胜负覆盖层。共享 theme
 * 视觉件；本模块无状态，全部命中检测为纯函数。
 */
import type { IdiomEntry, LinkKind } from './logic.ts';
export declare const LOGICAL_W = 480;
export declare const LOGICAL_H = 640;
/** 渲染所需的全部游戏视图状态（index.ts 持有并传入）。 */
export interface IdiomChainView {
    /** 当前局（1..ROUNDS）。 */
    round: number;
    /** 当前链长。 */
    chainLen: number;
    /** 链尾成语（卷轴大字展示）。 */
    tail: IdiomEntry;
    /** 手牌候选。 */
    hand: IdiomEntry[];
    /** 手牌每张的接法（null 为不可接）。 */
    playable: Array<LinkKind | null>;
    playerScore: number;
    aiScore: number;
    /** 本回合剩余毫秒。 */
    remainingMs: number;
    /** AI 提示行（如「AI：一马当先 +20」），空串无。 */
    aiLine: string;
    /** AI 行出现的时间戳（毫秒，滑入动画用）。 */
    aiAtMs: number;
    /** 临时提示（如「这张接不上」）。 */
    toast: string;
    phase: 'playing' | 'over';
    /** 玩家按 P 的手动暂停。 */
    userPaused: boolean;
    /** 面板驱动的暂停（实例未运行）。 */
    paused: boolean;
}
/** 第 i 张手牌的矩形。 */
export declare function cardRect(i: number): {
    x: number;
    y: number;
    w: number;
    h: number;
};
/** 命中检测：返回点击到的手牌下标，未命中返回 null。 */
export declare function cardAt(x: number, y: number): number | null;
/** 跳过按钮命中。 */
export declare function skipButtonAt(x: number, y: number): boolean;
/**
 * 整帧绘制。
 * @param ctx - 画布上下文。
 * @param view - 当前视图状态。
 * @param nowMs - 当前时间戳（毫秒，动画相位用）。
 */
export declare function renderIdiomChain(ctx: CanvasRenderingContext2D, view: IdiomChainView, nowMs: number): void;
