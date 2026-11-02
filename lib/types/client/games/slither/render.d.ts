/**
 * 贪吃蛇大作战渲染层：摄像机跟随 + 发光蛇身圆链 + 朝向眼睛 + 加速拖尾
 * 光 + 光点 glow + 世界边界圈 + 左下小地图 + HUD（长度/排名/击杀）+
 * 死亡/暂停 overlay。全部为纯 canvas 绘制；摄像机状态由调用方
 * （index.ts）持有并传入，本模块不保存跨帧状态。
 */
import { type SlitherState } from './logic.ts';
/** 逻辑画布尺寸。 */
export declare const LOGICAL_W = 960;
export declare const LOGICAL_H = 600;
/** 每帧由 index.ts 组装的视图参数。 */
export interface SlitherView {
    /** 摄像机中心（世界坐标）。 */
    camX: number;
    camY: number;
    /** 逻辑坐标指针（画瞄准指示用，可为 null）。 */
    pointerX: number;
    pointerY: number;
    pointerActive: boolean;
    paused: boolean;
}
/**
 * 整帧渲染入口：背景 -> 世界（网格点/边界/光点/蛇）-> 小地图 -> HUD ->
 * 暂停/死亡 overlay。
 * @param ctx - 画布上下文。
 * @param state - 引擎状态。
 * @param view - 摄像机与指针等视图参数。
 */
export declare function renderSlither(ctx: CanvasRenderingContext2D, state: SlitherState, view: SlitherView): void;
