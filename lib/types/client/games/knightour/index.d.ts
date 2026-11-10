/**
 * 马踏棋盘游戏定义：把纯巡游逻辑接到画布实例上——点击高亮格走马步，
 * H 触发 Warnsdorff 最小出度提示（每局 3 次，过关计分扣减），R 重开、
 * P 暂停，[ / ] 在已解锁档位（5x5/6x6/8x8）间切换。dirty 按需重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const knightourGame: MiniGameDefinition;
