/**
 * 麻将连连看游戏定义：把纯逻辑（logic.ts）与渲染（render.ts）接成
 * {@link MiniGameInstance}——点击选牌配对（同牌 + ≤2 拐路径即消）、H 提示、
 * 死局自动洗牌、R 重开、P 暂停、[ / ] 切换关卡，关卡进度经 level-progress
 * 持久化。使用 dirty 帧循环：静态时零重绘，动画或秒表跳变时才画。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const mahjongGame: MiniGameDefinition;
