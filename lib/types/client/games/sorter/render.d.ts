/**
 * 传送带分拣渲染层：仓库夜景背景、三条滚动传送带（滚轮随带速转动的
 * 行进动画）、彩色包裹（辉光 + 色环）、分流口的转向挡板（挡板楔形 +
 * 当前颜色 + 色键提示）、底部四节颜色车厢（装载数进度）、分拣成功 /
 * 失误的粒子迸发、上浮渐隐飘字、HUD（分数 / 失误 / 连击 / 档位）、暂停
 * 与结算遮罩。HUD 覆在半透明深色条上保持共享主题文字可读性。
 */
import type { SorterState } from './logic.ts';
/**
 * 渲染一帧：背景、传送带、包裹、挡板、车厢、飘字、粒子、HUD、遮罩。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderSorter(ctx: CanvasRenderingContext2D, state: SorterState, paused: boolean): void;
