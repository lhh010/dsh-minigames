/**
 * 节奏打击 game definition：4 轨道下落式节奏游戏——D/F/J/K 或点击
 * 轨道底部打击落到判定线的音符，PERFECT 金 / GOOD 蓝，连击每 50 升
 * 倍率（最高 x4）；MISS 或漏接扣血，3 命打完谱面。R 重开、P 暂停；
 * 判定事件波纹与粒子反馈，onScore 随得分变化上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const rhythmGame: MiniGameDefinition;
