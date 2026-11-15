/**
 * 镜面光线游戏定义：把纯逻辑接成 {@link MiniGameInstance}——点击镜面
 * 在 '/' 与 '\\' 间翻转（hover 旋转预览），H 提示（贪心自动翻转一面能
 * 改善点亮的镜）、R 重开本关、P 暂停、[ ] 切换关卡、过关后 Enter 进入
 * 下一关（进度经 readLevel/saveLevel('lightpath') 持久化）。流光与脉冲
 * 常驻动画 → continuous 帧循环；分数经 onScore 上报。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const lightpathGame: MiniGameDefinition;
