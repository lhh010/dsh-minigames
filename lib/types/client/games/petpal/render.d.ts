/**
 * 电子宠物 PetPal 的绘制层：像素风房间（窝/食盆/玩具/窗）、按生长阶段
 * 与进化形态程序绘制的宠物精灵（圆滚身体 + 眨眼 + 心情嘴 + 污垢点 +
 * 睡姿 Zzz + 形态差异的角/耳/尾/天线）、四维变色属性条、操作按钮栏、
 * 成长阶段 HUD、追逐光点场地与睡觉关灯遮罩。纯 canvas 绘制，无状态。
 */
import type { PetState } from './logic.ts';
/** 逻辑画布尺寸。 */
export declare const LOGICAL_W = 960;
export declare const LOGICAL_H = 600;
/** 底部操作按钮栏的按钮标识。 */
export declare const BUTTON_IDS: readonly ["meal", "snack", "feast", "play", "clean", "sleep"];
export type ButtonId = (typeof BUTTON_IDS)[number];
/** 按钮中文名。 */
export declare const BUTTON_NAMES: Record<ButtonId, string>;
/** 一个按钮的矩形布局。 */
export interface ButtonRect {
    id: ButtonId;
    x: number;
    y: number;
    w: number;
    h: number;
}
/** 底部按钮栏布局（6 个等宽圆角按钮）。 */
export declare function buttonRects(): ButtonRect[];
/** 命中测试：逻辑坐标落在哪个按钮上（无命中返回 null）。 */
export declare function buttonAt(x: number, y: number): ButtonId | null;
/** 追逐光点小游戏的场地矩形（logic 内坐标归一化到该矩形）。 */
export declare const PLAY_ARENA: {
    x: number;
    y: number;
    w: number;
    h: number;
};
/** 宠物当前身体中心（含呼吸浮动）。 */
export declare function petCenter(state: PetState, timeMs: number): {
    x: number;
    y: number;
    r: number;
};
/** 一帧渲染入口：场景 → 宠物 → UI → 遮罩/覆盖层。 */
export declare function renderPet(ctx: CanvasRenderingContext2D, state: PetState, timeMs: number, paused: boolean): void;
