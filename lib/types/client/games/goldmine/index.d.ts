/**
 * 淘金者游戏定义：把纯逻辑接入 {@link MiniGameInstance} —— 方向键 / WASD
 * 逐格移动挖掘，R 整局重开（新种子），P 暂停；dirty 帧循环 + 下落动画 /
 * 倒计时秒变期间逐帧，分数实时上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const goldmineGame: MiniGameDefinition;
