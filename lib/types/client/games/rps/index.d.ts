/**
 * 猜拳心理战游戏定义：把马尔可夫读心逻辑接成 {@link MiniGameInstance}
 * —— 数字键 1/2/3 或点击底部按钮出拳（石头/剪刀/布），R 重开、P 暂停；
 * 每轮按预测复盘 + 每 3 轮一句真假提示，连赢触发火花，dirty 按需重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const rpsGame: MiniGameDefinition;
