/**
 * 数块游戏定义：把填数逻辑接入 MiniGameInstance —— 点击（或方向键）
 * 选中格子，数字键输入 1..区域大小，空格循环 +1，0/退格清空；给定格
 * 锁定不可改。冲突（区域内重复 / 王邻域同数）实时红显。H 闪烁一个
 * 填错/未填格的应填值 2.5 秒（任何提示都放弃时间奖励）。S 切换 AI 演
 * 示：分帧受限回溯求解器每帧只吃有限节点，逐步把盘面填完。R 重开、
 * P 暂停、[ ] 在已到达关卡间切换；readLevel/saveLevel 持久化进度。
 * dirty 帧循环：静止时零重绘。生成 ≤2ms，无需缓存。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const suguruGame: MiniGameDefinition;
