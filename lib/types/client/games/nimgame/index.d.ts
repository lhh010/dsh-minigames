/**
 * 取子博弈 Nim 游戏定义：把纯逻辑接成 {@link MiniGameInstance}。交互：
 * 点击一排选中（高亮 + 每根火柴可点），点击选中排的第 n 根（从右数）
 * 即取 n 根；←→/AD 选排、↑↓/数字 1-7 调取子数、回车/空格确认。AI 回合
 * 带思考动画（900ms，暂停时冻结剩余量）。玩家赢局按「底分 10 + AI 本
 * 局取走的火柴数」计分并上报 onScore，5 局一赛后展示总况 overlay。
 * R 重开整赛（新种子）、P 暂停。dirty 渲染：AI 思考 / 结果动画 / 粒子
 * 期间逐帧，静止时零重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const nimgameGame: MiniGameDefinition;
