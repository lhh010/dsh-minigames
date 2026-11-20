/**
 * 天平称重 Scales 画布渲染器：中上天平（横梁随最近一次结果倾斜、左右
 * 盘吊绳 + 盘上硬币小圆点）、底部硬币网格（点击循环 台面→左盘→右盘→
 * 台面）、右侧称量历史（三态着色）、左侧推理助手候选面板（开关时）、
 * 称量/清盘按钮与指认模式（选币 + 轻/重按钮）。渲染器无状态（倾斜缓
 * 动由调用方持有的 ScalesView 承担），共用 ../theme.ts 视觉套件。
 */
import type { ScalesState } from './logic.ts';
export declare const LOGICAL_W = 720;
export declare const LOGICAL_H = 480;
/** 按钮与面板的点击区（逻辑坐标）。 */
export declare const WEIGH_BTN: {
    x: number;
    y: number;
    w: number;
    h: number;
};
export declare const CLEAR_BTN: {
    x: number;
    y: number;
    w: number;
    h: number;
};
export declare const LIGHT_BTN: {
    x: number;
    y: number;
    w: number;
    h: number;
};
export declare const HEAVY_BTN: {
    x: number;
    y: number;
    w: number;
    h: number;
};
/** 倾斜缓动动画状态（调用方持有，每帧 tick）。 */
export interface ScalesView {
    /** 当前展示倾角（向目标指数缓动）。 */
    tilt: number;
    /** 目标倾角（由最近一次称量结果决定）。 */
    target: number;
}
/** 为一局创建视图（初始水平）。 */
export declare function createScalesView(): ScalesView;
/**
 * 倾斜缓动推进一帧（指数逼近，误差 <0.002 时吸附）。
 * @param view - 视图（原地更新）。
 * @param dt - 帧间秒。
 * @returns 是否仍在动画（调用方据此继续 markDirty）。
 */
export declare function tickScalesView(view: ScalesView, dt: number): boolean;
/**
 * 命中检测：逻辑坐标 (x,y) 落在哪枚硬币上。
 * @param coins - 硬币总数。
 * @returns 硬币下标，或 null。
 */
export declare function coinAt(coins: number, x: number, y: number): number | null;
/** (x,y) 是否落在称量按钮上。 */
export declare function weighBtnAt(x: number, y: number): boolean;
/** (x,y) 是否落在清盘按钮上。 */
export declare function clearBtnAt(x: number, y: number): boolean;
/** (x,y) 是否落在指认「偏轻」按钮上。 */
export declare function lightBtnAt(x: number, y: number): boolean;
/** (x,y) 是否落在指认「偏重」按钮上。 */
export declare function heavyBtnAt(x: number, y: number): boolean;
/**
 * 绘制一帧。
 * @param view - 倾斜缓动视图。
 * @param left - 当前放在左盘的硬币下标。
 * @param right - 当前放在右盘的硬币下标。
 * @param accuseMode - 指认模式（点币选中而非入盘）。
 * @param accuseSel - 指认模式下选中的硬币，null 未选。
 * @param assistantOn - 推理助手是否开启。
 * @param remainingSec - 限时剩余秒数，null 不限时。
 * @param paused - 显示暂停遮罩。
 * @param toast - 瞬时提示，null 无。
 */
export declare function renderScales(ctx: CanvasRenderingContext2D, w: number, h: number, state: ScalesState, view: ScalesView, left: readonly number[], right: readonly number[], accuseMode: boolean, accuseSel: number | null, assistantOn: boolean, remainingSec: number | null, paused: boolean, toast: string | null): void;
