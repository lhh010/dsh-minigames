/**
 * 磁极迷宫游戏定义：把纯逻辑接成 {@link MiniGameInstance}——continuous
 * 帧循环推进确定性物理与渲染；空格 / 点击翻转活动磁铁极性（全场唯一
 * 操作），R 重开、P 暂停，累计分经 onScore 上报（最高分由面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const magnetGame: MiniGameDefinition;
