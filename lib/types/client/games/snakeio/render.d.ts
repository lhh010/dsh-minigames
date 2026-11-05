/**
 * 蛇界争霸渲染层：摄像机跟随 + 矩形毒墙世界 + 收缩毒圈 + 发光蛇身
 * 圆链 + 朝向眼睛 + 光点 glow + 左下小地图 + HUD（长度/排名/击杀/毒圈）
 * + 死亡 / 吃鸡 / 暂停 overlay。全部为纯 canvas 绘制；摄像机状态由调用方
 * （index.ts）持有并传入，本模块不保存跨帧状态。
 */
import { type IoState } from './logic.ts';
/** 逻辑画布尺寸。 */
export declare const LOGICAL_W = 960;
export declare const LOGICAL_H = 600;
/** 每帧由 index.ts 组装的视图参数。 */
export interface IoView {
    /** 摄像机中心（世界坐标）。 */
    camX: number;
    camY: number;
    paused: boolean;
}
/**
 * 整帧渲染入口：背景 -> 世界（网格点/毒墙/毒圈/光点/蛇）-> 小地图 ->
 * HUD -> 暂停/死亡/吃鸡 overlay。
 * @param ctx - 画布上下文。
 * @param state - 引擎状态。
 * @param view - 摄像机等视图参数。
 */
export declare function renderSnakeio(ctx: CanvasRenderingContext2D, state: IoState, view: IoView): void;
