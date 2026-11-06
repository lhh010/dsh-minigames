/**
 * 五骰 Yahtzee 画布渲染：五颗骰子（锁定高亮 + 图钉、滚动动画抖动）、
 * 掷骰按钮、13 格计分面板（未填格实时预估分灰色、已填格实分亮色、
 * 上区/快速艇加成与总分汇总）、回合 HUD、暂停与终局覆盖层。共享 theme
 * 视觉件；本模块无状态，全部命中检测为纯函数。
 */
import type { Category, Scores } from './logic.ts';
export declare const LOGICAL_W = 480;
export declare const LOGICAL_H = 660;
export declare const HUD_H = 30;
/** 渲染所需的全部游戏视图状态（index.ts 持有并传入）。 */
export interface YahtzeeView {
    /** 当前 5 颗骰面（1..6；动画期间未锁定骰由渲染层另算展示面）。 */
    dice: number[];
    /** 每颗骰的锁定标记。 */
    held: boolean[];
    /** 本回合已掷次数（0..3）。 */
    rollsUsed: number;
    /** 已填格数（0..13）。 */
    filledCount: number;
    /** 已填格记录。 */
    scores: Scores;
    /** 快速艇奖励次数。 */
    yahtzeeBonus: number;
    /** 当前总分。 */
    total: number;
    /** 掷骰滚动动画进行中。 */
    rolling: boolean;
    /** 未填格在当前骰面下的预估分（由 index.ts 注入 scoreCategory，渲染层不重复计分）。 */
    estimate: (category: Category) => number;
    /** 临时提示文本（如「该格已填」），空串表示无。 */
    toast: string;
    status: 'playing' | 'ended';
    /** 玩家按 P 的手动暂停。 */
    userPaused: boolean;
    /** 面板驱动的暂停（实例未运行）。 */
    paused: boolean;
}
/** 第 i 颗骰子的矩形。 */
export declare function dieRect(i: number): {
    x: number;
    y: number;
    w: number;
    h: number;
};
/**
 * 命中检测：返回点击到的骰子下标（0..4），未命中返回 null。
 */
export declare function dieAt(x: number, y: number): number | null;
/** 掷骰按钮命中。 */
export declare function rollButtonAt(x: number, y: number): boolean;
/**
 * 命中检测：返回点击到的计分格，未命中返回 null。
 */
export declare function categoryAt(x: number, y: number): Category | null;
/**
 * 绘制一帧。
 * @param nowMs - 当前时间戳（毫秒），驱动滚动动画的轮换面与抖动相位。
 */
export declare function renderYahtzee(ctx: CanvasRenderingContext2D, view: YahtzeeView, nowMs: number): void;
