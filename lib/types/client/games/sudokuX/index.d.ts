/**
 * 对角数独游戏定义：把纯盘面逻辑接成 {@link MiniGameInstance}——点击选
 * 格，数字键填入（笔记模式下记候选数），N 切换笔记，H 提示，X 切换对
 * 角线高亮，R 重开本关，P 暂停；过关后点击进入下一关并上报分数。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const sudokuXGame: MiniGameDefinition;
