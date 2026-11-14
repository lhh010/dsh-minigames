/**
 * 叠叠乐 game definition：把纯静力学 logic 接成 MiniGameInstance——
 * 点击木块抽出（顶层满 3 块不可抽，非法点击忽略）；抽出成功播放抽块
 * 飞出动画 + 得分上报，抽出导致应力超限则塔倒：坍塌粒子 + 屏幕抖动
 * + 结束 overlay；无块可抽为收手通关，关卡 5 层 → 8 层递进。
 * R 重开当前关，P 暂停；dirty 渲染，动画期间标记脏帧。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const jengaGame: MiniGameDefinition;
