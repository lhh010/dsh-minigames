/**
 * 倒水谜题 Jugs 画布渲染器：左侧水龙头（点击装满选中壶）、右侧排水槽（点击倒空）、
 * 中间容量各异的壶（高度按容量比例，水位带缓动画，标注容量/当前水量）。
 * 渲染器无状态（缓动画由调用方持有的 JugsView 承担），共用 ../theme.ts 视觉套件。
 */
import type { JugsState } from './logic.ts';
export declare const LOGICAL_W = 560;
export declare const LOGICAL_H = 360;
/** 水龙头与排水槽的点击区。 */
export declare const TAP_RECT: {
    x: number;
    y: number;
    w: number;
    h: number;
};
export declare const DRAIN_RECT: {
    x: number;
    y: number;
    w: number;
    h: number;
};
/** 壶水位缓动动画状态（调用方持有，每帧 tick）。 */
export interface JugsView {
    /** 各壶展示水量（向真实水量指数缓动）。 */
    display: number[];
}
/**
 * 为一局创建水位缓动视图（初始展示 = 真实水量）。
 * @param state - 当前局面。
 * @returns 新视图对象。
 */
export declare function createJugsView(state: JugsState): JugsView;
/**
 * 水位缓动推进一帧（指数逼近，误差 <0.01 时吸附）。
 * @param view - 视图（原地更新）。
 * @param state - 目标局面（壶数不变时复用同一视图）。
 * @param dt - 帧间秒。
 * @returns 是否仍在动画（调用方据此继续 markDirty）。
 */
export declare function tickJugsView(view: JugsView, state: JugsState, dt: number): boolean;
/**
 * 第 i 只壶的矩形（逻辑坐标，高度按容量比例）。
 * @param capacities - 各壶容量。
 * @param i - 壶序号。
 * @returns x/y/w/h 矩形。
 */
export declare function jugRect(capacities: readonly number[], i: number): {
    x: number;
    y: number;
    w: number;
    h: number;
};
/**
 * 命中检测：逻辑坐标 (x,y) 落在哪只壶上。
 * @param capacities - 各壶容量。
 * @returns 壶序号，或 null。
 */
export declare function jugAt(capacities: readonly number[], x: number, y: number): number | null;
/** (x,y) 是否落在水龙头区。 */
export declare function tapAt(x: number, y: number): boolean;
/** (x,y) 是否落在排水槽区。 */
export declare function drainAt(x: number, y: number): boolean;
/**
 * 绘制一帧。
 * @param view - 水位缓动视图。
 * @param selected - 选中（源）壶序号，null 未选。
 * @param paused - 显示暂停遮罩。
 * @param toast - 瞬时非法操作提示，null 无。
 */
export declare function renderJugs(ctx: CanvasRenderingContext2D, w: number, h: number, state: JugsState, view: JugsView, selected: number | null, paused: boolean, toast: string | null): void;
