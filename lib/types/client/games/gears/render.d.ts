/**
 * 齿轮谜题 canvas 渲染：金属质感齿轮（视觉齿数与真实齿数一致、随传动
 * 方向与转速旋转）、动力轮绿色 / 目标轮金色、目标格方向箭头与转速标注、
 * 底部候选齿数槽（1-4 选中高亮）、关卡 HUD 与过关/暂停 overlay。
 * 使用共享视觉套件（../theme.ts）。文件内不使用模板字符串。
 */
import type { GearsState } from './logic.ts';
export declare const CELL = 60;
export declare const HUD_H = 44;
export declare const SLOT_H = 64;
export declare const MARGIN = 14;
/** 固定逻辑画布尺寸。 */
export declare const LOGICAL_W: number;
export declare const LOGICAL_H: number;
/** 渲染侧视图选项。 */
export interface GearsView {
    paused: boolean;
}
/** 画一帧。 */
export declare function renderGears(ctx: CanvasRenderingContext2D, state: GearsState, view: GearsView): void;
