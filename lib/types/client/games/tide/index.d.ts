/**
 * 潮汐赶海游戏定义：把纯逻辑接成 {@link MiniGameInstance}——方向键 /
 * WASD 网格移动（keydown 触发，不监听 repeat），R 重开、P 暂停，
 * continuous 帧循环推进潮汐模拟与渲染，分数经 onScore 上报（最高分由
 * 面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const tideGame: MiniGameDefinition;
