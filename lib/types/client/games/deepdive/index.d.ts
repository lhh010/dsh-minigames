/**
 * 深海潜水游戏定义：把纯逻辑接入 {@link MiniGameInstance} —— 方向键移动、
 * 空格上浮（船上则出发），商店按钮点击购买升级，R 整局重开（新种子）、
 * P 暂停；continuous 帧循环，净值（资产 + 本趟收获）实时上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const deepdiveGame: MiniGameDefinition;
