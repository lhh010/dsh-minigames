/**
 * 配方厨房游戏定义：把纯灶台逻辑接成 MiniGameInstance——点击订单卡换
 * 单、点击工位下单/取料、空格循环换单、R 重开一局、P 暂停（暂停即停
 * tick，倒计时与火候随之冻结）。continuous 帧循环：火苗/游标/倒计时
 * 每帧都在动。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const recipeGame: MiniGameDefinition;
