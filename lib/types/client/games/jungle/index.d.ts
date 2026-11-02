/**
 * 斗兽棋游戏定义：把纯规则引擎与分帧 AI 组装成 {@link MiniGameInstance}。
 * 玩家执红（下方），AI 执黑；点击选子/走子，AI 通过 createSearch
 * 每帧一步分帧搜索不卡画面。U 悔棋、D 切换难度、R 重开、P 暂停。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const jungleGame: MiniGameDefinition;
