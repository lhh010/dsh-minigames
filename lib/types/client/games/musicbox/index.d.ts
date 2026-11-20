/**
 * 音乐盒游戏定义：把纯状态机（logic.ts）接成 {@link MiniGameInstance}。
 * 播放用 Web Audio 振荡器按 buildPlayback 的时间表发声（首击手势后初始化）；
 * 玩家从七根唱名条（点击或 1-7 键）逐音复现。空格重播（次数有限）、
 * H 提示（限 2 次）、Enter 推进/重开、R 同种子重开、P 暂停。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const musicboxGame: MiniGameDefinition;
