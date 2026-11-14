/**
 * 叠叠乐渲染：等轴测投影木塔（层偶沿 X、奇沿 Z 正交），木色顶面
 * + 两侧面明暗；悬空高危块按 previewStress 由琥珀渐变到红并加辉光，
 * hover 块描边高亮。布局计算（computeLayout）与绘制分离，命中测试
 * （blockHitTest）复用同一布局保证点选与显示一致。
 */
import { type JengaState } from './logic.ts';
/** 逻辑画布宽（px）。 */
export declare const logicalW = 640;
/** 逻辑画布高（px）。 */
export declare const logicalH = 600;
/** 一个块的投影布局：顶面四边形 + 屏幕包围盒。 */
export interface BlockLayout {
    level: number;
    slot: number;
    /** 顶面四角（顺时针）。 */
    top: Array<{
        x: number;
        y: number;
    }>;
    /** 全部 8 角的包围盒。 */
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}
/**
 * 计算整塔布局：底层到顶层逐块投影。块长沿层方向（偶层沿 X、奇层
 * 沿 Z），宽 1 单元、屏幕高 LEVEL_H。
 */
export declare function computeLayout(state: JengaState): BlockLayout[];
/**
 * 命中测试：从顶层往下找第一个顶面（或包围盒）包含点的仍在位块。
 * @returns 'level:slot' 键或 null。
 */
export declare function blockHitTest(state: JengaState, x: number, y: number): string | null;
/**
 * 绘制整塔场景：背景、应力着色的等轴测木塔（近块后画）、hover 高亮、
 * 分数 / 层数 / 已抽块 HUD；ended 时叠加结束 overlay。
 * @param ctx - 画布上下文（逻辑坐标系已由 fitCanvas 设置）。
 * @param state - 塔状态。
 * @param hover - hover 块键（'level:slot'）或 null。
 * @param shake - 屏幕抖动幅度（px，0 不抖）。
 * @param paused - 暂停 overlay。
 * @param flashText - 结束语（塔倒 / 收手）或 null。
 */
export declare function renderJenga(ctx: CanvasRenderingContext2D, state: JengaState, hover: string | null, shake: number, paused: boolean, flashText: string | null): void;
