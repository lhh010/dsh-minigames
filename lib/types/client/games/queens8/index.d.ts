/**
 * 八皇后游戏定义：把纯逻辑接成 {@link MiniGameInstance}。交互：点击
 * 空格放置皇后、点击皇后移除；悬停格子显示行/列/两对角线攻击范围，
 * 悬停皇后时红色连线指向其攻击到的皇后；冲突皇后红色辉光标记。
 * [ / ] 在 4/6/8 档间切换（换档即开新局），R 重开本档，P 暂停。
 * 计时挑战：过关得分 = winScore(档位, 用时秒, 放置次数)，越快、步数
 * 越少分越高，过关后累进总分并上报 onScore。dirty 渲染：计时秒跳变、
 * 悬停变化、过关粒子期间重绘，静止时零重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const queens8Game: MiniGameDefinition;
