/**
 * 蚁群引路游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击使用
 * 当前工具（放/撤障碍石 或 滴糖水），Z 切换工具，X 直接切到糖水，
 * R 重开整局，P 暂停；continuous 帧循环（蚁群每帧都在动）。分数跨关
 * 累计，变化时经 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const anttrailGame: MiniGameDefinition;
