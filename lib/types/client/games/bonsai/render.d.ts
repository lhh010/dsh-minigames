/**
 * 盆栽大师渲染层：陶盆 + 土壤剖面、枝干（棕色随级变细、节间微弯贝塞尔）、
 * 节点末端叶簇（绿色随健康度渐变）、可拖太阳（方位驱动趋光性）、目标树型
 * 金色虚线轮廓、浇水后的能量流向微光动画、游戏日/健康/评分实时 HUD 与
 * 过关/枯死/暂停遮罩。基于共享主题工具，纯 canvas 绘制；修剪/浇水/过关
 * 由 index 层调用 burstBonsai 触发粒子。
 */
import type { BonsaiState } from './logic.ts';
export declare const LOGICAL_W = 960;
export declare const LOGICAL_H = 640;
/** 在画布坐标 (x,y) 触发一簇粒子（index 层动作反馈）。 */
export declare function burstBonsai(x: number, y: number, color: string, count?: number, speed?: number): void;
/** 太阳把手中心（画布坐标）。 */
export declare function sunPosition(state: BonsaiState): {
    x: number;
    y: number;
};
/**
 * 命中判定：距太阳把手 SUN_R 内返回 'sun'，否则返回距鼠标 12px 内的最浅
 * 枝节点 id（根不可剪，故排除），无命中返回 null。
 * @param state - 游戏状态。
 * @param x - 画布 x。
 * @param y - 画布 y。
 * @returns 'sun' | 节点 id | null。
 */
export declare function pickAt(state: BonsaiState, x: number, y: number): 'sun' | number | null;
export declare function renderBonsai(ctx: CanvasRenderingContext2D, state: BonsaiState, paused: boolean, timeMs: number, hoverId: number | null, dtMs: number): void;
