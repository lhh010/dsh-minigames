import { type IdleCraftState } from './logic.ts';
/** 逻辑画布尺寸。 */
export declare const LOGICAL_W = 720;
export declare const LOGICAL_H = 480;
/** 一条飘字。 */
interface FloatText {
    /** 逻辑 x（生成点）。 */
    x: number;
    /** 逻辑 y（生成点）。 */
    y: number;
    /** 已存活毫秒。 */
    life: number;
    /** 显示文本。 */
    text: string;
    /** 序号（横向偏移按序取模，避免随机）。 */
    seq: number;
}
/** 渲染层动画状态（index 持有并逐帧喂给渲染）。 */
export interface IdleCraftView {
    /** 按压动画剩余毫秒（>0 时按钮缩到 0.92）。 */
    press: number;
    /** 滚动显示的总产出（向真值缓动）。 */
    shownTotal: number;
    /** 齿轮累计旋转角（毫秒积分）。 */
    spin: number;
    /** 飘字池。 */
    floats: FloatText[];
    /** 飘字序号计数。 */
    seq: number;
}
/** 创建渲染动画状态。 */
export declare function createIdleCraftView(): IdleCraftView;
/**
 * 生成一条 +N 飘字（敲打/里程碑时调用）。
 * @param view - 渲染动画状态。
 * @param text - 飘字内容。
 */
export declare function pushFloat(view: IdleCraftView, text: string): void;
/** 判断逻辑坐标是否落在敲打按钮上。 */
export declare function hammerHit(x: number, y: number): boolean;
/**
 * 渲染一帧。
 * @param ctx - 逻辑坐标系下的 2d 上下文。
 * @param state - 一局状态。
 * @param view - 渲染动画状态（会被推进：缓动、旋转、飘字寿命）。
 * @param dtMs - 本帧毫秒（动画推进用，非逻辑 tick）。
 * @param paused - 暂停中（按钮变灰、提示继续）。
 */
export declare function renderIdleCraft(ctx: CanvasRenderingContext2D, state: IdleCraftState, view: IdleCraftView, dtMs: number, paused: boolean): void;
export {};
