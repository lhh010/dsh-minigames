/**
 * 桌上冰球游戏定义：把纯逻辑接到 {@link MiniGameInstance}——鼠标/触摸
 * 直接控制下半区推杆（限速追踪，防止瞬移穿透），R 重开、P 暂停，终场
 * 点击/空格重开。continuous 帧循环；onScore 在终场一次性上报全场累计
 * 玩家进球数。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const icehockeyGame: MiniGameDefinition;
