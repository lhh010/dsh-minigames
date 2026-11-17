/**
 * 深海潜水渲染层：竖直卷轴海洋（浅蓝 → 深黑分层渐变，随深度变暗）、
 * 上浮气泡粒子、船与水面线、发光宝物（珍珠/金币/沉箱）、正弦漂浮水母、
 * 暗流箭头带、戴氧气表的潜水员与照明灯锥、深度计/氧气条（低氧红警）/
 * 本趟收获 HUD、船上商店面板（升级按钮 + 出发）与暂停/通关遮罩。全部为
 * 纯 canvas 绘制，特效（气泡、收获闪光）只观察逻辑状态，不改逻辑。
 */
import type { DeepDiveState, UpgradeKey } from './logic.ts';
/** 顶部 HUD 高度（逻辑像素）。 */
export declare const HUD_H = 46;
/** 逻辑画布尺寸。 */
export declare const LOGICAL_W = 360;
export declare const LOGICAL_H = 600;
/** 每米深度的像素比例（卷轴滚动用）。 */
export declare const PX_PER_M = 3;
/** 商店升级按钮矩形（index 层点击命中用，顺序 = UPGRADE_KEYS）。 */
export declare const UPGRADE_KEYS: readonly UpgradeKey[];
export interface ButtonRect {
    x: number;
    y: number;
    w: number;
    h: number;
}
export declare const SHOP_BTNS: Readonly<Record<UpgradeKey, ButtonRect>>;
export declare const DIVE_BTN: ButtonRect;
/**
 * 绘制一帧。
 * @param ctx - 画布上下文（逻辑坐标系已由 fitCanvas 设置）。
 * @param state - 游戏状态。
 * @param t - 累计秒数（动画时钟）。
 * @param paused - 是否显示暂停遮罩。
 */
export declare function renderDeepDive(ctx: CanvasRenderingContext2D, state: DeepDiveState, t: number, paused: boolean): void;
