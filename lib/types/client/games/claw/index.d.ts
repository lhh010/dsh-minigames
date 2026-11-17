/**
 * 抓娃娃机游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击 / 空格
 * 两段锁定（水平 → 前后），爪摆动下落夹取，夹中护送到出口，途中可能
 * 滑落；continuous 帧循环推进模拟与渲染（摆动 + 爪动画常动），R 重开、
 * P 暂停，分数经 onScore 上报（最高分由面板管理）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const clawGame: MiniGameDefinition;
