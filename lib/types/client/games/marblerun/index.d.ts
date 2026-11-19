/**
 * 滚珠轨道 MarbleRun 游戏定义：把纯逻辑轨道物理接成
 * {@link MiniGameInstance}。建造期（dirty 按需渲染）：点击空格放置当前
 * 选中件、滚轮旋转（悬停已放置件则旋转它）、右键移回库存、1-5 切换
 * 件种、U 撤回；空格释放滚珠进入测试期（continuous 连续渲染）：固定
 * 子步确定性物理推进，入杯迸粒子过关上报 onScore（关卡基础分 + 剩余
 * 库存件奖励），出界 / 停滞 / 撞尖刺失败可回收。R 重开本关、P 暂停、
 * N 过关后进下一关。
 */
import type { MiniGameDefinition } from '../types.ts';
/** 滚珠轨道 MarbleRun：搭一段轨道让滚珠安全入杯。 */
export declare const marblerunGame: MiniGameDefinition;
