/**
 * 滑雪大冒险渲染层：晨光→白昼的三段式渐变天空、三层视差雪山（带雪线
 * 与云层）、前景飘雪与高速速度线、折线雪坡（亮/影双描边 + 雪纹扫线 +
 * 木质积雪跳台）、四态玩家（贴地压板扬雪 / 腾空随姿态前倾后仰 / 翻滚
 * 残影 / 骑乘伙伴小动画 + 落地挤压拉伸）、双层错相位锯齿雪崩浪（浪顶
 * 喷雪、逼近红色 vignette 与增强震动、被吞没过渡）、旋转闪光金币、带
 * 阴影的树石与带气泡提示的伙伴、弧形渐变雪崩警告 HUD、上飘缩放特技
 * 浮字与四行统计结算面板；相机 lerp 平滑跟随并在腾空时轻微拉远。
 */
import { type AvaState } from './logic.ts';
/**
 * 渲染一帧。相机 lerp 平滑跟随玩家并腾空拉远；雪崩逼近时叠加渐进震动
 * 与红色 vignette；消费逻辑层事件驱动粒子、闪帧与挤压形变；被吞没时
 * 播放横扫过渡后进入结算面板。
 * @param ctx - 画布上下文。
 * @param state - 当前状态。
 * @param paused - 是否显示暂停遮罩。
 * @param dtMs - 帧间隔 ms（默认 16；暂停传 0 冻结动画）。
 */
export declare function renderAvalanche(ctx: CanvasRenderingContext2D, state: AvaState, paused: boolean, dtMs?: number): void;
