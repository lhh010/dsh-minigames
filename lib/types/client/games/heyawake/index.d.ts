/**
 * 别府涂黑游戏定义：把房间涂黑逻辑接入 MiniGameInstance —— 点击（或方向键
 * + 空格）在黑/白之间切换格子；当黑格互不相邻、每个数字房间恰好涂满其数、
 * 白格全部连通时过关。关卡按展示级在页面生命周期内缓存（按关卡确定性
 * 生成）。H 闪烁一个玩家尚未涂黑且应涂黑的格子 2.5 秒（任何提示都放弃
 * 时间奖励）。已持久化的关卡从上次进度继续；P 暂停（过关倒计时用剩余
 * 时间冻结模式）；R 重开；[ ] 在已到达关卡间切换。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const heyawakeGame: MiniGameDefinition;
