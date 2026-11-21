/**
 * 落沙物语游戏定义：continuous 帧循环内按 30Hz 结算 CA；点击 / 拖拽
 * 用当前工具，1-4 切换工具，空格暂停模拟，R 重开（过关时进下一关），
 * P 暂停整局；金砂收集时爆粒子并按规范上报分数。
 */
import type { MiniGameDefinition } from '../types.ts';
/** 落沙物语：确定性落沙元胞自动机解谜——挖岩引金砂入桶。 */
export declare const sandsimGame: MiniGameDefinition;
