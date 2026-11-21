/**
 * 潜行渗透渲染器：谍战深色房间（棋盘地板格 + 厚墙）、守卫身体与朝向
 * 视野锥半透明扇形（逐射线步进，遇墙自动截断，警觉满转红加宽）、特工
 * 玩家小圆、钻石闪光、守卫头顶警觉条、生命/关卡/钻石/分数 HUD、被抓
 * 红闪与过关/暂停 overlay。只用共享视觉套件；纯函数无状态。
 */
import { type StealthState } from './logic.ts';
/** 单格逻辑像素。 */
export declare const CELL = 30;
/** 顶部 HUD 高度。 */
export declare const HUD_H = 44;
/** 底部常驻速览行高。 */
export declare const HINT_H = 26;
/** 最大关卡尺寸（17×13）决定固定逻辑画布。 */
export declare const MAX_COLS = 17;
export declare const MAX_ROWS = 13;
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** 渲染附加选项。 */
export interface StealthRenderOptions {
    /** 显示暂停 overlay。 */
    paused: boolean;
    /** 五关全部通关（显示最终通关 overlay 而非单关过关）。 */
    finished: boolean;
    /** 时间基准（毫秒），驱动钻石闪烁。 */
    nowMs: number;
}
/** 任意格的中心像素坐标（盘面在剩余空间中居中，含 HUD 与速览行边距）。 */
export declare function stealthCellCenter(state: StealthState, x: number, y: number): {
    px: number;
    py: number;
};
/** 渲染整帧。
 * @param ctx 画布上下文（逻辑坐标系）
 * @param state 完整状态
 * @param options 渲染附加选项
 */
export declare function renderStealth(ctx: CanvasRenderingContext2D, state: StealthState, options: StealthRenderOptions): void;
