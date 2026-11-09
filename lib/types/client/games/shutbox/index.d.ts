/**
 * 关箱 Shut the Box 游戏定义：把纯逻辑接成 {@link MiniGameInstance} ——
 * 空格/点击掷两骰，点击立着的数字选组合，子和恰等于骰面总和即整组翻下
 * （翻多枚得连击加分）；掷骰后无法凑出点和即本局终了，按剩余和计分；
 * 全部翻下即关箱满分。5 局一赛记总分，终局上报。R 重开、P 暂停。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const shutboxGame: MiniGameDefinition;
