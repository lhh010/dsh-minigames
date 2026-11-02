/**
 * 黑洞吞噬游戏定义：把确定性引擎接成 {@link MiniGameInstance}——指针
 * 移动（黑洞朝指针匀速逼近）、R 重开（同 seed 换局号）、P 暂停；
 * continuous 帧循环内以固定步长累积器推进模拟（每帧至多补 3 个 tick），
 * 摄像机平滑跟随玩家洞。吞数即分数，经 onScore 上报；里程碑/咬合事件
 * 转浮字与粒子。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const holeGame: MiniGameDefinition;
