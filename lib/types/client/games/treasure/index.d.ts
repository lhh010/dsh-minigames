/**
 * 寻宝猎人游戏定义：把纯逻辑接入 {@link MiniGameInstance} —— 点击盘面
 * 探测 / 指认，A 切换同心圆助手，H 使用排除提示，Enter 提前进入指认，
 * R 整局重开（新种子），P 暂停；dirty 按需帧循环，分数实时上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const treasureGame: MiniGameDefinition;
