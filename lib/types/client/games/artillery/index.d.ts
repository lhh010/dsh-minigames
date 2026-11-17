/**
 * 炮台对决游戏定义：把纯逻辑接成 {@link MiniGameInstance}——在画布上拖拽
 * 定炮口仰角（0-90 度），点击/拖拽底部力度条定力度，空格发射；
 * ↑↓ 微调角度、←→ 微调力度，R 重开、P 暂停。continuous 帧循环
 * 推进弹道与粒子，比赛得分（胜局 ×100 + 夺冠加成）经 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const artilleryGame: MiniGameDefinition;
