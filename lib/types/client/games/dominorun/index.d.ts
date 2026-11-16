/**
 * 多米诺连锁 DominoRun 游戏定义：把纯逻辑连锁模拟接成
 * {@link MiniGameInstance}。建造期（dirty 按需渲染）：点击空位放置当前
 * 选中件型、右键移回库存、数字键 1/2/3 切换件型、U 撤回。空格从起点
 * 推倒进入连锁动画（continuous 逐帧渲染，固定拍长步进 logic.stepChain）：
 * 逐牌倒下旋转波浪，撞响铃铛 = 过关上报 onScore，链断 = 失败，空格回
 * 建造期重摆。R 重开本关、P 暂停。
 */
import type { MiniGameDefinition } from '../types.ts';
export declare const dominorunGame: MiniGameDefinition;
