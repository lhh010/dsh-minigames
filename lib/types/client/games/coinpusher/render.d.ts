/**
 * 推金币渲染：游艺厅机台侧视——台面、往复推板、三层币堆、投币下落、
 * 前玻璃反光、掉落结算浮字与粒子（粒子由 index 用 theme.createParticles
 * 驱动），HUD（分数 / 剩余币 / 倒计时）与暂停、结束 overlay。所有绘制
 * 使用 theme 共享视觉件，逻辑坐标 640x480 与 logic.ts 几何常量一致。
 */
import { type CoinPusherState } from './logic.ts';
export declare const LOGICAL_W = 640;
export declare const LOGICAL_H = 480;
/** 浮字（掉落结算 +N）：由 render 持有池，index 在结算事件时 add。 */
export interface Floater {
    x: number;
    y: number;
    text: string;
    color: string;
    life: number;
}
export interface FloaterSystem {
    /** 在结算点生成一枚上浮文字。 */
    add(x: number, y: number, text: string, color: string): void;
    /** 推进并绘制；每帧调用一次。 */
    tick(ctx: CanvasRenderingContext2D, dtMs: number): void;
    /** 池是否为空（脏渲染判断用；本游戏为 continuous，仅诊断）。 */
    size(): number;
}
/** 创建浮字池（上限 24，超出丢最旧）。 */
export declare function createFloaters(): FloaterSystem;
export interface CoinPusherRenderProps {
    state: CoinPusherState;
    paused: boolean;
    floaters: FloaterSystem;
}
/**
 * 绘制整帧。
 * @param ctx 逻辑坐标系（640x480）下的画布上下文。
 * @param props 局状态、暂停标记与浮字池。
 */
export declare function renderCoinPusher(ctx: CanvasRenderingContext2D, props: CoinPusherRenderProps): void;
