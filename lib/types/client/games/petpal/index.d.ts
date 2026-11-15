/**
 * 电子宠物 PetPal 游戏定义：把纯逻辑内核接成 {@link MiniGameInstance}。
 * 点击按钮喂食/玩耍/清洁/睡觉，点击宠物互动（蛋期敲壳、睡眠叫醒、
 * 平时抚摸），玩耍时点击场地里的移动光点；R 清存档重开（换一只新
 * 种子的蛋），P 暂停。帧循环用 dirty 模式——宠物眨眼/浮动等逐帧动画
 * 每帧标脏，交互事件标脏，静止时零重绘。进度定期写入 localStorage，
 * 重进面板时从存档继续。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const petpalGame: MiniGameDefinition;
