/**
 * 摩斯电码游戏接线：把纯逻辑挂进 MiniGameInstance——解码轮由调度器按
 * dt 推进播放进度并点亮指示灯，编码轮以 keydown 起表、keyup 判时长；
 * dirty 渲染（亮灯/按压/倒计时才重绘），暂停经调度器停走天然冻结。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const morseGame: MiniGameDefinition;
