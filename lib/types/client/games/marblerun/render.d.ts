/**
 * 滚珠轨道 MarbleRun 渲染层：科技蓝图风网格盘面 + 轨道件（带旋转纹
 * 理）+ 金属滚珠拖尾 + 尖刺 / 目标杯 / 库存栏 HUD + 过关覆盖层。全部
 * 为纯 canvas 绘制（无 DOM、无自身状态），由 index.ts 持状态并按
 * dirty / 逐帧调度调用。
 */
import { type LevelDef, type PieceKind, type Placement, type RunWorld } from './logic.ts';
/** 逻辑画布宽（网格区）。 */
export declare const LOGICAL_W: number;
/** 网格区高。 */
export declare const BOARD_H: number;
/** 底部库存栏高。 */
export declare const BAR_H = 54;
/** 逻辑画布总高（网格 + 库存栏）。 */
export declare const LOGICAL_H: number;
/** 渲染视图快照（index.ts 每帧组装，渲染层只读）。 */
export interface RenderView {
    /** 关卡定义。 */
    level: LevelDef;
    /** 已放置轨道件。 */
    placements: readonly Placement[];
    /** 剩余库存。 */
    inventory: Readonly<Record<PieceKind, number>>;
    /** 释放中的物理世界（建造期为 null）。 */
    run: RunWorld | null;
    /** 关卡序号（0 起）。 */
    levelIndex: number;
    /** 建造 / 释放阶段。 */
    mode: 'build' | 'run';
    /** 已定格的结果（won 或失败类型；running 期间为 null）。 */
    outcome: 'won' | 'out' | 'stuck' | 'shattered' | null;
    /** 暂停中。 */
    paused: boolean;
    /** 当前选中件种类（建造光标）。 */
    selectedKind: PieceKind;
    /** 待放置旋转档位。 */
    pendingRot: number;
    /** 悬停格（逻辑像素→格；无则为 null）。 */
    hoverCell: {
        x: number;
        y: number;
    } | null;
    /** 悬停格是否可放（库存 / 封锁判定后的提示色）。 */
    hoverValid: boolean;
    /** 本关得分（未过关为 null）。 */
    score: number | null;
}
/**
 * 逻辑像素 → 网格格坐标（含建造光标吸附；网格区外返回 null）。
 * @param x - 逻辑像素横坐标。
 * @param y - 逻辑像素纵坐标。
 */
export declare function pickCell(x: number, y: number): {
    x: number;
    y: number;
} | null;
/**
 * 逻辑像素 → 库存栏槽位序号（PIECE_KINDS 下标；栏外返回 null）。
 * @param x - 逻辑像素横坐标。
 * @param y - 逻辑像素纵坐标。
 */
export declare function inventorySlotAt(x: number, y: number): number | null;
/**
 * 主渲染入口：画完整一帧（网格 / 出珠口 / 杯 / 尖刺 / 轨道件 / 幻影
 * 光标 / 滚珠 / HUD / 库存栏 / 覆盖层）。纯函数，无副作用。
 * @param ctx - 画布上下文（逻辑坐标已由 fitCanvas 变换）。
 * @param view - 视图快照。
 * @param leftover - 剩余库存件总数（HUD 用，index 传入避免重复计算）。
 */
export declare function renderScene(ctx: CanvasRenderingContext2D, view: RenderView, leftover: number): void;
