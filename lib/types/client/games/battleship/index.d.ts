/**
 * 海战棋游戏定义：把 {@link Battle} 状态机接成 {@link MiniGameInstance} ——
 * 布舰期点击放舰、X 旋转、空格随机补齐 / 确认开战；战斗期点击敌方海域
 * 开炮（命中连开、miss 换 AI，AI 回合带索敌延迟与连开链）；H 热图提示、
 * R 重开挑战、P 暂停。5 局挑战（难度 L1→L5），积分 = 赢局 100 + 剩余
 * 弹量加成，通过 onScore 上报。脏标记渲染（见 frame-scheduler）。
 */
import type { MiniGameDefinition } from '../types.ts';
/** 海战棋：经典 Battleship 对 AI，概率热图 + 追击的猫鼠博弈。 */
export declare const battleshipGame: MiniGameDefinition;
