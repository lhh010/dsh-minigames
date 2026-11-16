/**
 * 水排序 WaterSort 渲染层：玻璃试管、水层色块与液面微晃、选中高亮与
 * 顶段上浮、倾倒水流弧线动画、完成勾标、HUD 与过关/暂停遮罩。全部为
 * 纯 canvas 绘制，状态只读；动画进度由 {@link WaterSortView} 持有。
 */
import { type WaterSortState } from './logic.ts';
/** 逻辑画布宽（px）。 */
export declare const LOGICAL_W = 640;
/** 逻辑画布高（px）。 */
export declare const LOGICAL_H = 470;
/** 倾倒动画时长（ms）。 */
export declare const POUR_MS = 300;
/** 一根试管的矩形（逻辑坐标）。 */
export interface TubeRect {
    x: number;
    y: number;
    w: number;
    h: number;
}
/** 动画视图状态：累计时间与进行中的倾倒动画。 */
export interface WaterSortView {
    /** 累计时间（秒），驱动液面晃动。 */
    time: number;
    /** 进行中的倾倒（null = 无）；t 为已进行毫秒。 */
    pour: {
        from: number;
        to: number;
        color: number;
        amount: number;
        t: number;
    } | null;
}
/** 新建动画视图。
 * @returns 空视图（无倾倒进行中）。 */
export declare function createWaterSortView(): WaterSortView;
/** 开始一段倾倒动画。
 * @param view - 动画视图。
 * @param from - 源管下标。
 * @param to - 目标管下标。
 * @param color - 被倾倒的颜色编号。
 * @param amount - 移动层数。 */
export declare function startPourAnim(view: WaterSortView, from: number, to: number, color: number, amount: number): void;
/** 推进动画时钟。
 * @param view - 动画视图。
 * @param dt - 帧间隔（秒）。
 * @returns 是否仍有倾倒动画进行中（true 时应继续逐帧重绘）。 */
export declare function tickWaterSortView(view: WaterSortView, dt: number): boolean;
/** 计算各试管矩形：≤5 根单排居中，更多则双排。
 * @param count - 试管数。
 * @returns 每根试管的矩形。 */
export declare function tubeRects(count: number): TubeRect[];
/** 命中测试：逻辑坐标落在哪根试管（±6px 容差）。
 * @param x - 逻辑横坐标。
 * @param y - 逻辑纵坐标。
 * @param count - 试管数。
 * @returns 试管下标，未命中为 null。 */
export declare function tubeAt(x: number, y: number, count: number): number | null;
/** 整帧绘制：背景、HUD、试管、动画、提示与遮罩。
 * @param ctx - 画布上下文（已应用逻辑坐标变换）。
 * @param w - 逻辑宽。
 * @param h - 逻辑高。
 * @param state - 只读局面。
 * @param view - 动画视图。
 * @param selected - 选中的源管下标（null = 未选）。
 * @param paused - 是否暂停（绘制暂停遮罩）。
 * @param toast - 顶部临时提示（null = 无）。 */
export declare function renderWaterSort(ctx: CanvasRenderingContext2D, w: number, h: number, state: WaterSortState, view: WaterSortView, selected: number | null, paused: boolean, toast: string | null): void;
