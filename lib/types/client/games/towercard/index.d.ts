/**
 * 迷你爬塔 TowerCard 游戏定义：把纯逻辑接成 {@link MiniGameInstance}——
 * 点击手牌打出（攻击默认首个存活敌人，多敌时先点敌人立绘选定目标），
 * 点击/空格结束回合，奖励界面点击三卡领取，R 重开（新种子），P 暂停。
 * 回合制 dirty 帧循环：输入、浮字、受击抖动与粒子期间逐帧重绘；分数在
 * 战斗胜利/死亡/通关时经 onScore 上报（层数 x100，通顶 +500+剩余血量）。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const towercardGame: MiniGameDefinition;
