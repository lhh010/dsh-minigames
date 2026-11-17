/**
 * N-Back 记忆训练渲染层：极简实验室风。左侧 3×3 网格蓝色脉冲点亮当前
 * 位置；右侧双流数字窗与「位置匹配 A / 声音匹配 S」两个按钮（命中绿闪、
 * 误按红震、漏按灰闪）；顶部 N 档/进度/准确率 HUD；节间小结面板与
 * ready/paused/over 共享 overlay。全部为纯 canvas 绘制。
 */
import type { NBackState } from './logic.ts';
/** 渲染阶段（与实例侧 uiPhase 对应）。 */
export type UiPhase = 'ready' | 'playing' | 'paused' | 'summary' | 'over';
/** 矩形命中区（index.ts 点击命中复用）。 */
export interface NBackRect {
    x: number;
    y: number;
    w: number;
    h: number;
}
/** 「位置匹配」按钮命中区。 */
export declare function nbackPositionButton(): NBackRect;
/** 「声音匹配」按钮命中区。 */
export declare function nbackAudioButton(): NBackRect;
/** 逻辑坐标 → 按钮命中判定。 */
export declare function pointInRect(px: number, py: number, rect: NBackRect): boolean;
/**
 * 绘制一帧。
 * @param ctx - 画布上下文（逻辑坐标系已由 fitCanvas 应用）。
 * @param state - 逻辑状态。
 * @param t - 运行秒数（脉冲/震动动画）。
 * @param phase - 渲染阶段。
 */
export declare function renderNBack(ctx: CanvasRenderingContext2D, state: NBackState, t: number, phase: UiPhase): void;
