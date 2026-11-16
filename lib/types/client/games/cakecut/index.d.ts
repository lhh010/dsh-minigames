/**
 * 蛋糕等分 CakeCut 入口：点击两点定一刀（虚线预览吸附到块边交点），
 * 把蛋糕切成面积完全相等的 K 份。切块后两片沿刀线法向微微分开；每块
 * 实时显示面积偏差（超差红显）。H 切换对称辅助线、U 撤回一刀、
 * R 重开本关、P 暂停；过关上报分数并自动进入下一关，进度持久化。
 * dirty 渲染：仅在交互与分离动画期间重绘。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const cakecutGame: MiniGameDefinition;
