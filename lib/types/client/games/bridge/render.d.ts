/**
 * 过桥难题 Bridge 画布渲染：夜色两岸 + 中间木桥，人物槽位带速度数字，
 * 手电光斑跟随持灯岸 / 过桥队伍，底部用时条逼近限时变红，关卡 HUD 与
 * 过关 / 超时 / 暂停 overlay。渲染器无状态（全部信息由调用方通过
 * {@link BridgeView} 传入），同一输入绘制结果确定。
 */
import { type BridgeLevel, type BridgeState, type Side } from './logic.ts';
/** 逻辑画布尺寸。 */
export declare const LOGICAL_W = 560;
export declare const LOGICAL_H = 380;
/**
 * 岸上第 i 个人的槽位矩形（与绘制严格一致，供命中检测复用）。
 * @param side 岸侧。
 * @param i 岸内序号。
 */
export declare function bankSlotRect(side: Side, i: number): {
    x: number;
    y: number;
    w: number;
    h: number;
};
/**
 * 命中检测：逻辑坐标落在哪个人物槽位上。
 * @returns 命中人员的 { side, id }；落空返回 null。
 */
export declare function hitPerson(x: number, y: number, state: BridgeState): {
    side: Side;
    id: string;
} | null;
/** 桥面（含引导箭头区域）是否被点中——即「点桥过桥」。 */
export declare function hitBridge(x: number, y: number): boolean;
/** 一帧的全部绘制输入（由 index 持有并驱动）。 */
export interface BridgeView {
    /** 当前逻辑状态（cross 阶段仍是出发前快照）。 */
    state: BridgeState;
    /** 关卡定义。 */
    level: BridgeLevel;
    /** 0 起关卡下标。 */
    levelIndex: number;
    /** play=选人操作；cross=过桥动画；fail=超时；won=过关；paused=暂停。 */
    phase: 'play' | 'cross' | 'won' | 'fail' | 'paused';
    /** 已选中待过桥的人员 id（仅 play 阶段）。 */
    selected: string[];
    /** 过桥队伍 id（仅 cross 阶段）。 */
    movers: string[];
    /** 过桥进度 0..1（仅 cross 阶段）。 */
    crossProgress: number;
    /** 全部通关（第 5 关也完成）。 */
    allClear: boolean;
}
/**
 * 绘制一整帧：夜空 → HUD → 两岸 → 木桥 → 手电 → 过桥队伍 → 用时条 →
 * 结算 overlay。
 * @param view 见 {@link BridgeView}。
 */
export declare function renderBridgeScene(ctx: CanvasRenderingContext2D, view: BridgeView): void;
