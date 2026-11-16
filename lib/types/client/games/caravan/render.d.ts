import { type CaravanState } from './logic.ts';
/** 驼队动画时钟：fromIdx→toIdx 的行程进度 t（0..1）与事件卡翻开进度 cardT。 */
export interface CaravanAnim {
    fromIdx: number;
    toIdx: number;
    t: number;
    cardT: number;
}
/** 一块可点击区域（渲染时收集，index 命中测试用）。 */
export interface CaravanHit {
    x: number;
    y: number;
    w: number;
    h: number;
    kind: 'city' | 'buy' | 'sell';
    payload: number;
}
/**
 * 绘制整帧：背景卷轴、道路绿洲、城市与驼队、右侧行情面板、HUD、
 * 事件卡与结算/暂停遮罩。
 * @param ctx - 逻辑坐标系的 2d 上下文。
 * @param s - 商队状态。
 * @param paused - 暂停遮罩开关。
 * @param anim - 动画时钟（null：驼队静止停在当前城市）。
 * @param hits - 可选：绘制时收集的可点击区域（先清空再填充）。
 */
export declare function renderCaravan(ctx: CanvasRenderingContext2D, s: CaravanState, paused: boolean, anim: CaravanAnim | null, hits?: CaravanHit[]): void;
