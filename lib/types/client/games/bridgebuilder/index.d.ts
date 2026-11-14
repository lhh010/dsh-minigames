/**
 * 建桥大师 Bridge Builder 游戏定义：把纯逻辑结构求解器接成
 * {@link MiniGameInstance}。建造期（dirty 按需渲染）：点击两个网格点放
 * 梁、点击杆件拆除（全额退款）；空格进入测试期（continuous 连续渲
 * 染）：固定子步确定性物理推进，杆件断裂迸粒子，车达右岸过关上报
 * onScore（关卡基础分 + 剩余预算）。R 重开本关、P 暂停、N 过关后进
 * 下一关。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const bridgeBuilderGame: MiniGameDefinition;
