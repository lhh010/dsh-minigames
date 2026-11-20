/**
 * 音乐盒渲染层：固定逻辑坐标（LOGICAL_W x LOGICAL_H）内的纯 canvas 绘制 ——
 * 顶部 HUD（关卡/命/分/提示/播放次数）、中部旋律拍槽（已填唱名与当前拍）、
 * 下部七根可点击唱名条，以及各阶段的遮罩。不含任何 DOM 或状态变更。
 */
import { type MusicBoxState } from './logic.ts';
/** 逻辑画布宽。 */
export declare const LOGICAL_W = 560;
/** 逻辑画布高。 */
export declare const LOGICAL_H = 480;
/** 渲染视图输入：纯状态 + index 层维护的展示态。 */
export interface MusicBoxView {
    state: MusicBoxState;
    paused: boolean;
    /** localStorage 最佳分（面板代管）。 */
    best: number;
    /** 正在播放的拍下标（听辨阶段的金色高亮）；null 表示未在播放。 */
    playSlot: number | null;
    /** 每个唱名的闪烁剩余秒数：正数绿闪（答对），负数红闪（答错），0 无。 */
    flashes: number[];
    /** 底部提示消息（如"播放次数已用完"）；null 不显示。 */
    message: string | null;
}
/** 唱名条 n 的中心 x 坐标。 */
export declare function barCenterX(n: number): number;
/**
 * 命中测试：逻辑坐标 (x, y) 落在哪根唱名条的点击热区。
 * @param x - 逻辑 x。
 * @param y - 逻辑 y。
 * @returns 唱名下标 0..6；不在热区返回 -1。
 */
export declare function solfegeHit(x: number, y: number): number;
/**
 * 绘制一帧音乐盒。
 * @param ctx - 逻辑坐标已就位的 2d 上下文。
 * @param view - 视图状态。
 */
export declare function renderMusicBox(ctx: CanvasRenderingContext2D, view: MusicBoxView): void;
