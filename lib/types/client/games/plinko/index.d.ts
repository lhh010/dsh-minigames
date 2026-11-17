/**
 * 弹珠瀑布 Plinko 游戏定义：确定性物理逻辑接成 {@link MiniGameInstance}。
 * ←/→ 移动瞄准列，空格或点击投放区投放；H 切换直方图预览（第 1 轮后
 * 解锁）；R 重开一局（新种子），P 暂停。continuous 帧循环：logic.step
 * 按 f.dt 推进（内部固定子步），落槽事件触发粒子火花与浮字，分数变化
 * 时经 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const plinkoGame: MiniGameDefinition;
