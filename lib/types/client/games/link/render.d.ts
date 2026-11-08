/**
 * 连连看 Link 渲染层：牌面网格（选中高亮、消除连线动画）、关卡/剩余对数/
 * 分数 HUD、倒计时条、洗牌按钮与剩余次数、过关/通关/失败/暂停 overlay 与
 * 消除粒子。使用共享视觉 kit（../theme.ts）与 logic.ts 的纯状态。
 */
import type { LinkState } from './logic.ts';
/** 逻辑画布尺寸（网格在其中自适应居中）。 */
export declare const LOGICAL_W = 840;
export declare const LOGICAL_H = 720;
/** 顶部 HUD（关卡/对数/分数 + 计时条）高度。 */
export declare const HUD_H = 56;
/** 底部操作带（洗牌按钮/死局提示）高度。 */
export declare const BOTTOM_H = 64;
/** 图案池：面 id 0..19 对应的 emoji（数量与 logic.POOL_SIZE 一致）。 */
export declare const FACE_EMOJI: string[];
/** 连线动画时长（ms）。 */
export declare const PATH_MS = 420;
/** 洗牌按钮矩形（逻辑坐标，index.ts 命中测试共用）。 */
export declare const SHUFFLE_BTN: {
    x: number;
    y: number;
    w: number;
    h: number;
};
/** index.ts 持有的动画视图状态。 */
export interface LinkView {
    /** 最近一次消除连线的动画起始时刻（performance.now()，ms）。 */
    pathAt: number;
}
/** 建立初始视图。 */
export declare function createLinkView(): LinkView;
/** 网格自适应布局：格边与棋盘左上角（随关卡尺寸在逻辑画布内居中）。 */
export interface BoardLayout {
    cell: number;
    x: number;
    y: number;
}
/** 计算当前关卡的网格布局（render 与 index 命中测试共用）。 */
export declare function boardLayout(state: LinkState): BoardLayout;
/** 连线动画是否仍在播放。 */
export declare function pathAnimActive(state: LinkState, view: LinkView, now: number): boolean;
/**
 * 绘制一帧。
 * @param ctx - 画布上下文（已应用逻辑坐标变换）。
 * @param state - 逻辑状态。
 * @param view - 动画视图。
 * @param paused - 是否显示暂停遮罩。
 * @param now - 当前时刻（performance.now()，ms）。
 * @param dtMs - 距上一帧的毫秒数（粒子推进用）。
 * @returns 是否仍有动画进行（index.ts 据此继续 markDirty）。
 */
export declare function renderLink(ctx: CanvasRenderingContext2D, state: LinkState, view: LinkView, paused: boolean, now: number, dtMs: number): boolean;
