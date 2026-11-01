/**
 * 高山滑雪游戏定义：把纯逻辑接成 {@link MiniGameInstance}——continuous
 * 帧循环推进模拟与渲染；←→/AD 横移或指针横向跟随（按键优先），R 重开、
 * P 暂停，累计分经 onScore 上报（最高分由面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const skiGame: MiniGameDefinition;
