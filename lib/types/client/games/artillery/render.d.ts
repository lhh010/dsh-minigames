/**
 * 炮台对决渲染层：黄昏渐变天空 + 落日与漂云、随高度场实时变化的剪影山丘
 * （弹坑销毁即时可见）、炮管随角度旋转并带开火后坐的炮台、飞行拖尾与
 * 只演前段的弹道预测虚线、爆炸土块粒子 + 屏幕震动、风向旗与力度条、
 * 血量/局数/风力 HUD、暂停/单局/整场遮罩。
 */
import { type ArtilleryState } from './logic.ts';
/**
 * 画底部力度条：可点击/拖拽设定 1-100 力度。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 */
export declare const POWER_BAR: {
    x: number;
    y: number;
    w: number;
    h: number;
};
/**
 * 渲染一帧：震动偏移包裹全部场景，事件驱动粒子/后坐/震动。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 * @param dtMs - 帧间隔 ms（云漂移与震动衰减）。
 */
export declare function renderArtillery(ctx: CanvasRenderingContext2D, state: ArtilleryState, paused: boolean, dtMs: number): void;
