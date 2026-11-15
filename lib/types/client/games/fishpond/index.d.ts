/**
 * 鱼塘物语游戏定义：把纯鱼塘逻辑接成 MiniGameInstance——顶部标签在
 * 鱼塘/钓点/市场三区域间切换；鱼塘视图点击塘格语境化喂食/出售、点击
 * 「结束今天」翻日；钓点视图点击驱动抛竿 → 锁力度 → 提竿双段判定；
 * 市场视图点击商店卡买鱼苗/鱼粮/扩塘。R 重开本关、P 暂停、N 过关后
 * 进下一关。dirty 帧循环：进行期每帧标记重绘（鱼群巡游、波纹、力度条
 * 与浮漂动画持续变化），暂停/通关静止时零重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const fishpondGame: MiniGameDefinition;
