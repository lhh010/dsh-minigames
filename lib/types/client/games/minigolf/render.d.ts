/**
 * 迷你高尔夫渲染器：俯视果岭、旗杆洞口、墙壁、斜坡箭头、沙坑颗粒、
 * 拖杆瞄准线与力度条、球滚动淡痕、入洞星级浮字与 HUD。全部绘制发生在
 * 固定逻辑坐标系（LOGICAL_W × LOGICAL_H）内；场地世界坐标按 SCALE 等
 * 比映射。渲染是纯绘制，不修改游戏状态。
 */
import { type MiniGolfState } from './logic.ts';
/** 逻辑画布宽度。 */
export declare const LOGICAL_W = 680;
/** 逻辑画布高度。 */
export declare const LOGICAL_H = 440;
/** 世界单位 → 逻辑像素比例。 */
export declare const SCALE: number;
/** 渲染视图参数：游戏状态 + 输入层附加信息。 */
export interface MiniGolfView {
    state: MiniGolfState;
    /** 面板暂停标志（绘制暂停遮罩用）。 */
    paused: boolean;
    /** 拖杆进行中的瞄准（角度 + 力度），覆盖键盘瞄准值。 */
    aim: {
        angle: number;
        power: number;
    } | null;
    /** 入洞星级浮字（星级 + 剩余显示秒数），null 表示无。 */
    star: {
        count: number;
        t: number;
    } | null;
}
/** 世界坐标 → 逻辑画布坐标。 */
export declare function worldToLogical(x: number, y: number): {
    x: number;
    y: number;
};
/** 逻辑画布坐标 → 世界坐标。 */
export declare function logicalToWorld(x: number, y: number): {
    x: number;
    y: number;
};
/** 渲染一帧迷你高尔夫（纯绘制，不修改状态）。 */
export declare function renderGolf(ctx: CanvasRenderingContext2D, view: MiniGolfView): void;
