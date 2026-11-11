/**
 * 飞镖 501 游戏定义：把纯逻辑接成 MiniGameInstance。鼠标移动瞄准，
 * 点击 / 空格掷镖（落点 = 瞄准点 + 手抖漂移），方向键微调瞄准；R 重开、
 * P 暂停。dirty 渲染 + 出镖粒子动画（动画期间主动标脏）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const dartsGame: MiniGameDefinition;
