/**
 * 桌上冰球渲染器：冰蓝渐变台面（中线 + 中圈弧、两端发光球门开口）、
 * 手柄感圆形推杆（玩家 accent(0) 蓝、AI accent(4) 红）、带拖尾的冰球、
 * 进球闪屏 + 粒子、居中大字比分 HUD（比分 / 局分 / 难度），终场用共
 * 享 overlay。纯 canvas 绘制，状态由 logic.ts 提供。
 */
import type { IceHockeyState } from './logic.ts';
/** 渲染层逻辑宽（供宿主对齐）。 */
export declare const ICEHOCKEY_W = 480;
/** 渲染层逻辑高。 */
export declare const ICEHOCKEY_H = 720;
/** 绘制一帧。 */
export declare function renderIcehockey(ctx: CanvasRenderingContext2D, state: IceHockeyState): void;
