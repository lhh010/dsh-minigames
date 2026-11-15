import { type Hand, type RpsState } from './logic.ts';
/** 逻辑坐标系宽。 */
export declare const LOGICAL_W = 720;
/** 逻辑坐标系高。 */
export declare const LOGICAL_H = 480;
/** 拳种大图标（渲染emoji，逻辑层不用）。 */
export declare const HAND_ICONS: readonly string[];
/** 渲染需要的对局视图（state 快照 + 暂停标志）。 */
export interface RpsView {
    state: RpsState;
    paused: boolean;
}
/**
 * 命中检测：点击坐标落在哪个出拳按钮内。
 * @param x - 逻辑坐标 x。
 * @param y - 逻辑坐标 y。
 * @returns 拳种编号，未命中返回 null。
 */
export declare function buttonAt(x: number, y: number): Hand | null;
/**
 * 整帧绘制。
 * @param ctx - 已应用 fit 变换的 2d 上下文。
 * @param view - 对局视图。
 */
export declare function renderRps(ctx: CanvasRenderingContext2D, view: RpsView): void;
