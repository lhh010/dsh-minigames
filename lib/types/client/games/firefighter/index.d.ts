/**
 * 消防救火游戏定义：把纯逻辑接成 {@link MiniGameInstance}——方向键/WASD
 * 移动消防员（按住连续走格），空格按住喷水锥形水柱，R 重开本关，
 * P 暂停，Enter 通关后再来一局。continuous 帧循环驱动；过关进度经
 * level-progress 持久化，得分变化经 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const firefighterGame: MiniGameDefinition;
