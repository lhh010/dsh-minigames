/**
 * 找茬大师游戏定义：把纯逻辑（seed 场景生成 / 命中判定 / 倒计时）接成
 * MiniGameInstance —— 点击右图的修改点即标记一处（两侧同时圈绿），点错
 * 扣 3 秒；5 关递进（元素更多、修改更细微、限时更短），找齐 5 处过关，
 * 时间耗尽失败。R 重开（换新 seed），P 暂停，过关后空格进下一关。倒计时
 * 用 dirty 按需渲染：显示秒变化 / 交互 / 粒子存活期间才重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const photohuntGame: MiniGameDefinition;
