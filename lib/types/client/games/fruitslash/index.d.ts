/**
 * 切水果游戏定义：把纯逻辑接成 {@link MiniGameInstance}——指针按住拖动
 * 产生刀光轨迹（pointerdown/move/up），continuous 帧循环推进模拟与渲染，
 * R 重开、P 暂停，分数经 onScore 上报（最高分由面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const fruitslashGame: MiniGameDefinition;
