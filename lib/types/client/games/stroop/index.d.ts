/**
 * 斯特鲁普游戏定义：把纯逻辑接成 {@link MiniGameInstance}——每帧以 dt
 * 推进限时，1-6 键或点击底部色块作答，答对触发火焰粒子，R 重开、
 * P 暂停（dirty 模式：剩余时间变化时每帧重绘，暂停时零重绘）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const stroopGame: MiniGameDefinition;
