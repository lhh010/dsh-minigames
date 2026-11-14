/**
 * 点灯游戏定义：把 Akari 逻辑接入 MiniGameInstance —— 点击白格放/取灯；
 * 所有白格被照亮、灯两两互不相见、数字墙邻灯数吻合时过关。关卡按展示级
 * 在页面生命周期内缓存（按关卡确定性生成）。H 提示标一个未照亮格 2.5 秒
 * （任何提示都放弃时间奖励）；R 重开；P 暂停；[ ] 在已到达关卡间切换。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const akariGame: MiniGameDefinition;
