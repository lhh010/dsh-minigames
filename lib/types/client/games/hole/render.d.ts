/**
 * 黑洞吞噬渲染层：俯视城市路网（街区 + 马路 + 斑马线）、简单形状物体
 * （树圆 / 路灯点 / 车矩形 / 楼方块带顶面偏移伪 3D）、多层旋涡渐变黑洞
 * （玩家蓝紫、AI 红系）与吸入收缩动画（位置/缩放已在 logic 层逐 tick
 * 更新，直接绘制即可）、里程碑浮字、HUD（倒计时/口径/吞数/排名）、小
 * 地图与结束排名 overlay。全部为纯 canvas 绘制；摄像机与浮字状态由
 * 调用方（index.ts）持有并传入，本模块不保存跨帧状态。
 */
import { type HoleState } from './logic.ts';
/** 逻辑画布尺寸。 */
export declare const LOGICAL_W = 960;
export declare const LOGICAL_H = 600;
/** 里程碑浮字（index.ts 持有并推进 age，>1 淡出）。 */
export interface FloatText {
    x: number;
    y: number;
    text: string;
    age: number;
}
/** 每帧由 index.ts 组装的视图参数。 */
export interface HoleView {
    camX: number;
    camY: number;
    /** 动画时钟（秒，驱动旋涡旋转）。 */
    time: number;
    paused: boolean;
    floats: FloatText[];
}
/**
 * 整帧渲染入口：城市 -> 物体 -> AI 洞 -> 玩家洞 -> 浮字 -> 小地图 ->
 * HUD -> 暂停/结束 overlay。
 * @param ctx - 画布上下文。
 * @param state - 引擎状态。
 * @param view - 摄像机/时钟/浮字等视图参数。
 */
export declare function renderHole(ctx: CanvasRenderingContext2D, state: HoleState, view: HoleView): void;
