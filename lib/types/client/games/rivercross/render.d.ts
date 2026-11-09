/**
 * 过河 River Crossing 画布渲染：左岸 / 河面（水波）/ 右岸三段布局，角色
 * emoji 网格、渡船往返动画、冲突岸红闪警示、HUD 与过关 / 失败 / 暂停
 * overlay。渲染器无状态（全部信息由调用方通过 {@link RiverView} 传入），
 * 水波相位由注入 seed 的 mulberry32 确定，同一关卡波形稳定。
 */
import { type RiverLevel, type RiverState, type Side } from './logic.ts';
/** 逻辑画布尺寸。 */
export declare const LOGICAL_W = 560;
export declare const LOGICAL_H = 380;
/** 开船按钮。 */
export declare const SAIL_RECT: {
    x: number;
    y: number;
    w: number;
    h: number;
};
/** 岸上第 i 个角色的槽位外框矩形。 */
export declare function bankSlotRect(side: Side, i: number): {
    x: number;
    y: number;
    w: number;
    h: number;
};
/**
 * 渡船当前中心 x：停泊在 boatSide 一侧，渡河途中按进度线性插值。
 * @param state 当前状态（渡河中 boatSide 仍为出发岸）。
 * @param progress 渡河进度 0..1（非渡河阶段传 0）。
 */
export declare function boatCenterX(state: RiverState, progress: number): number;
/**
 * 命中检测：逻辑坐标落在哪个可点击角色上。
 * @returns { where: 'left' | 'right' | 'boat', id } 或 null。
 */
export declare function hitChar(x: number, y: number, state: RiverState, level: RiverLevel): {
    where: 'left' | 'right' | 'boat';
    id: string;
} | null;
/** 开船按钮是否被点中。 */
export declare function hitSail(x: number, y: number): boolean;
/** 一帧的全部绘制输入（由 index 持有并驱动）。 */
export interface RiverView {
    state: RiverState;
    level: RiverLevel;
    levelIndex: number;
    crossings: number;
    par: number;
    /** play=停泊操作；cross=渡河动画；fail=失败红闪；won=过关；paused=暂停。 */
    phase: 'play' | 'cross' | 'fail' | 'won' | 'paused';
    /** 渡河进度 0..1（仅 cross 阶段有意义）。 */
    crossProgress: number;
    /** 动画累计毫秒（水波流动 / 红闪脉冲），仅动画阶段推进。 */
    animT: number;
    /** 失败信息（仅 fail 阶段）。 */
    fail: {
        bank: Side;
        pair: readonly [string, string];
    } | null;
    /** 全部通关（第 5 关也完成）。 */
    allClear: boolean;
}
/**
 * 绘制一整帧：背景 → HUD → 河面 → 两岸 → 船 → 开船按钮 → 结算 overlay。
 * @param view 见 {@link RiverView}。
 */
export declare function renderRiver(ctx: CanvasRenderingContext2D, view: RiverView): void;
