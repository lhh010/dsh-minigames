/**
 * 疾速集合 SET 游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击选卡
 * （3 张自动判定），成功三卡飞出 + 金色粒子，错误震动 + 扣时，开局 30 秒
 * 教学闪边；R 重开、P 暂停。计时持续流动，走 continuous 帧循环。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const setgameGame: MiniGameDefinition;
