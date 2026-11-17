/**
 * N-Back 记忆训练游戏定义：把纯逻辑接到 canvas 实例。A/S（或点击两个
 * 匹配按钮）作答，R 重开、P 暂停，空格/点击通过节间小结。渲染走 dirty
 * 调度：trial 点亮脉冲与反馈闪烁期间逐帧重绘，静止时零重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const nbackGame: MiniGameDefinition;
