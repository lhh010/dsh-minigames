/**
 * 记独游戏定义：把涂黑逻辑接入 MiniGameInstance —— 点击（或方向键 + 空格）
 * 在黑/白之间切换格子；当每行每列白格数字互不重复、黑格互不相邻且白格
 * 连通时过关。关卡按展示级在页面生命周期内缓存（按关卡确定性生成）。H
 * 闪烁一个应涂黑格 2.5 秒（任何提示都放弃时间奖励）。已持久化的关卡
 * 从上次进度继续；P 暂停（过关倒计时用剩余时间冻结模式）；R 重开；
 * [ ] 在已到达关卡间切换。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const hitoriGame: MiniGameDefinition;
