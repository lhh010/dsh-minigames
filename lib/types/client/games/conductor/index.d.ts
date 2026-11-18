/**
 * 列车调度游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击道岔
 * 切换 A/B 方向，空格按住加速 ×2，R 重开、P 暂停；continuous 帧循环
 * 推进模拟与渲染，本关完成后自动装载下一关，分数经 onScore 上报
 * （最高分由面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const conductorGame: MiniGameDefinition;
