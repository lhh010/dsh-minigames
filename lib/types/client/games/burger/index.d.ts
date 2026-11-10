/**
 * 汉堡师傅游戏定义：把纯订单逻辑接成 MiniGameInstance——展示期空格可
 * 立即跳过开做、点击配料按序复刻、R 重开一赛、P 暂停（暂停即停 tick，
 * 展示/倒计时随之冻结）。dirty 帧循环：活跃期每帧标记重绘（时间条与
 * 下落动画持续变化），结束/暂停静止时零重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const burgerGame: MiniGameDefinition;
