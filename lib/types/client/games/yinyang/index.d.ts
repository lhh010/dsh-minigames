/**
 * 阴阳双色游戏定义：把 YinYang 逻辑接入 MiniGameInstance —— 左键点击空格
 * 循环 黑→白→空（预标格不可改），右键直接清除；全部填满且黑/白各自四连
 * 通、无同色 2×2 时过关。关卡按展示级在页面生命周期内缓存（按关卡确定
 * 性生成）。H 提示填入一个确定色（本关任何提示都放弃时间奖励）；R 重
 * 开；P 暂停；[ ] 在已到达关卡间切换。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const yinyangGame: MiniGameDefinition;
