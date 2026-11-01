/**
 * 蹦蹦跳游戏定义：把纯逻辑接成 {@link MiniGameInstance}——continuous
 * 帧循环推进模拟与渲染，键盘 ←→/AD 横移，指针按住拖动同样横移，
 * R 重开、P 暂停，高度分经 onScore 上报（最高分由面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const jumperGame: MiniGameDefinition;
