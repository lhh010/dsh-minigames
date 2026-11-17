/**
 * 光轮对决游戏定义：把纯逻辑引擎与渲染层接入面板生命周期——
 * 方向键/WASD 转向、R 重开整场、P 暂停，continuous 帧循环驱动
 * 恒速步进与平滑插值，局间自动 1.6 秒后开下一局。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const tronGame: MiniGameDefinition;
