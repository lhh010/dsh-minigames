/**
 * 拆弹专家游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击线缆
 * 剪断（命中测试复用渲染层几何），R 重开、P 暂停（计时冻结），dirty
 * 帧循环：模拟每帧推进，画布只在状态变化 / 秒跳 / 红闪相位 / 粒子
 * 活动时重绘，分数经 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const defuseGame: MiniGameDefinition;
