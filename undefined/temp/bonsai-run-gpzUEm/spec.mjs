/** 盆栽大师纯逻辑测试：能量流萌发、顶端优势、修剪再分配、浇水/施肥与
 * 游戏日翻页、烂根致死、趋光偏置、评分合成与过关、5 关参数、seed 确定
 * 性与长 tick 重放（全部按 logic.ts 实际导出设计，无 DOM）。 */
import { describe, expect, it } from './shim.mjs';
import { ANGLE_LIMIT, BASE_ENERGY, DAY_TICKS, FERT_MULT, FERT_STOCK, LEVELS, MAX_CHILDREN, PHOTO_K, PRUNE_K, SPROUT_SPREAD, UPRIGHT_BONUS, WATER_MULT, advanceDay, createBonsaiState, fertilize, growthMult, isInsideTarget, mulberry32, nodeEndPositions, nodeGain, pruneNode, scoreBonsai, setSun, snapshotTree, tickBonsai, water, } from '../src/client/games/bonsai/logic.ts';
/** 手工挂一根从根末端指向 (x,y) 的叶枝（局部坐标，y 向上）。 */
function addLeaf(state, x, y, id) {
    const dy = y - 32; // 根末端在 (0, 32)
    const node = {
        id, parentId: 0, children: [], depth: 1,
        angle: Math.atan2(x, dy), length: Math.hypot(x, dy), energy: 0,
    };
    state.nodes[0].children.push(id);
    state.nodes.push(node);
    state.nextId = Math.max(state.nextId, id + 1);
}
describe('bonsai logic', () => {
    it('sprouts a first branch once root energy passes the threshold, then flows outward', () => {
        const state = createBonsaiState(42, 0);
        expect(state.nodes).toHaveLength(1);
        expect(state.nodes[0].energy).toBe(5);
        // 根无子枝不分流：每 tick 基础能量 +BASE_ENERGY，5 tick 后到 10 萌发
        for (let i = 0; i < 4; i += 1) {
            tickBonsai(state);
            expect(state.nodes).toHaveLength(1);
        }
        tickBonsai(state);
        expect(state.nodes).toHaveLength(2);
        const child = state.nodes[1];
        expect(child.parentId).toBe(0);
        expect(child.depth).toBe(1);
        expect(child.energy).toBe(0);
        // 继续生长：能量自根向上分流，子枝最终也萌发（树只增不减）
        const before = state.nodes.length;
        for (let i = 0; i < 60; i += 1)
            tickBonsai(state);
        expect(state.nodes.length).toBeGreaterThan(before);
        // 单节点子枝数封顶 MAX_CHILDREN
        for (const n of state.nodes)
            expect(n.children.length).toBeLessThanOrEqual(MAX_CHILDREN);
    });
    it('gives the most upright sibling the apical dominance bonus exactly', () => {
        const state = createBonsaiState(1, 0);
        // 两根角度相反的子枝：|x| 相同 → 光照增益相同；|angle| 相同 → 平局取先者
        for (const [id, angle] of [[1, 0.2], [2, -0.2]]) {
            state.nodes.push({ id, parentId: 0, children: [], depth: 1, angle, length: 40, energy: 0 });
            state.nodes[0].children.push(id);
        }
        const first = state.nodes.find((n) => n.id === 1);
        const second = state.nodes.find((n) => n.id === 2);
        const gFirst = nodeGain(state, first);
        const gSecond = nodeGain(state, second);
        expect(gFirst).toBeCloseTo(gSecond * UPRIGHT_BONUS, 10);
        expect(gFirst).toBeGreaterThan(BASE_ENERGY);
    });
    it('prunes a subtree, transfers its energy to siblings, and raises the growth multiplier', () => {
        const state = createBonsaiState(3, 0);
        state.nodes.push({ id: 1, parentId: 0, children: [3], depth: 1, angle: -0.6, length: 30, energy: 8 });
        state.nodes.push({ id: 2, parentId: 0, children: [], depth: 1, angle: 0.5, length: 30, energy: 2 });
        state.nodes.push({ id: 3, parentId: 1, children: [], depth: 2, angle: -0.9, length: 20, energy: 4 });
        state.nodes[0].children = [1, 2];
        state.nextId = 4;
        // 根不可剪、非法 id 剪不掉
        expect(pruneNode(state, 0)).toBe(0);
        expect(pruneNode(state, 99)).toBe(0);
        const siblingBefore = state.nodes.find((n) => n.id === 2).energy;
        expect(pruneNode(state, 1)).toBe(2); // 1 与其子 3 整棵剪除
        expect(state.nodes.map((n) => n.id)).toEqual([0, 2]);
        expect(state.nodes[0].children).toEqual([2]);
        // 被剪子树能量 8+4 全部转给唯一兄弟枝 2
        expect(state.nodes.find((n) => n.id === 2).energy).toBeCloseTo(siblingBefore + 12, 10);
        expect(state.prunedFraction).toBeCloseTo(2 / 4, 10);
        expect(state.pruneMult).toBeCloseTo(1 + PRUNE_K * (2 / 4), 10);
        expect(growthMult(state)).toBe(state.pruneMult);
    });
    it('manages water quota, fertilizer stock, boosts, and day rollover decay', () => {
        const state = createBonsaiState(7, 0);
        expect(state.fertStock).toBe(FERT_STOCK);
        expect(water(state)).toBe('watered');
        expect(state.waterBoostDays).toBe(1);
        expect(water(state)).toBe('rotted'); // 今日额度已尽
        expect(state.health).toBe(100 - 34);
        expect(fertilize(state)).toBe('fertilized');
        // 浇水 × 施肥增益叠乘
        expect(growthMult(state)).toBeCloseTo(WATER_MULT * FERT_MULT, 10);
        for (let i = 0; i < FERT_STOCK - 1; i += 1)
            expect(fertilize(state)).toBe('fertilized');
        expect(fertilize(state)).toBe('empty');
        // 打满 DAY_TICKS 自动翻页：额度重置、两个增益各衰减 1 日
        for (let i = 0; i < DAY_TICKS; i += 1)
            tickBonsai(state);
        expect(state.day).toBe(2);
        expect(state.waterQuota).toBe(1);
        expect(state.waterBoostDays).toBe(0);
        expect(state.fertBoostDays).toBe(0);
        expect(growthMult(state)).toBe(1);
        // 空格直接推进 1 日同样翻页并评分
        expect(state.lastScore).toBeGreaterThanOrEqual(0);
        expect(advanceDay(state)).toBe(true);
        expect(state.day).toBe(3);
    });
    it('kills the tree on the third root rot', () => {
        const state = createBonsaiState(9, 0);
        expect(water(state)).toBe('watered');
        advanceDay(state); // 重置额度
        expect(water(state)).toBe('rotted');
        expect(state.rotCount).toBe(1);
        advanceDay(state);
        expect(water(state)).toBe('rotted');
        expect(state.health).toBe(100 - 68);
        advanceDay(state);
        expect(water(state)).toBe('rotted-dead');
        expect(state.phase).toBe('dead');
        expect(water(state)).toBe('not-playing');
        expect(fertilize(state)).toBe('not-playing');
        expect(advanceDay(state)).toBe(false);
        const nodesBefore = state.nodes.length;
        tickBonsai(state); // 死树不再推进
        expect(state.nodes.length).toBe(nodesBefore);
    });
    it('biases new branch angles toward the dragged sun deterministically', () => {
        const seed = 1234;
        const state = createBonsaiState(seed, 0);
        setSun(state, 1);
        // 用同种子独立流复算首个萌发角：offset = 随机 spread + 趋光偏置
        const r = mulberry32(seed)();
        const expected = Math.max(-ANGLE_LIMIT, Math.min(ANGLE_LIMIT, (r * 2 - 1) * SPROUT_SPREAD + 1 * PHOTO_K));
        for (let i = 0; i < 5; i += 1)
            tickBonsai(state);
        const first = state.nodes[1];
        expect(first.angle).toBeCloseTo(expected, 10);
        expect(Math.abs(first.angle)).toBeLessThanOrEqual(ANGLE_LIMIT);
        // setSun 钳制到 [-1,1]
        setSun(state, 5);
        expect(state.sunAngle).toBe(1);
        setSun(state, -9);
        expect(state.sunAngle).toBe(-1);
    });
    it('composes the score from iou/density/health/height and passes a crafted cone', () => {
        const fresh = createBonsaiState(2, 0);
        const freshScore = scoreBonsai(fresh);
        expect(freshScore.total).toBeLessThan(40);
        expect(freshScore.passed).toBe(false);
        // 手工铺满圆锥目标冠：6 层 × 5 点叶簇，全部落在轮廓内
        const state = createBonsaiState(2, 0);
        const level = LEVELS[0];
        let id = 1;
        for (const y of [60, 100, 140, 175, 205, 225]) {
            const halfW = (level.crownW / 2) * (1 - y / level.crownH) + 6;
            for (const k of [-0.55, -0.25, 0, 0.25, 0.55]) {
                addLeaf(state, halfW * k, y, id);
                id += 1;
            }
        }
        const score = scoreBonsai(state);
        // 30 片叶 ≥ targetLeaves 26 → 密度满；健康 100；顶高 225 ∈ [150,260] → 高度满
        expect(score.density).toBe(1);
        expect(score.health).toBe(1);
        expect(score.height).toBe(1);
        expect(score.iou).toBeGreaterThan(0.25);
        expect(score.total).toBe(Math.round(score.iou * 40 + 25 + 25 + 10));
        expect(score.total).toBeGreaterThanOrEqual(70);
        expect(score.passed).toBe(true);
        // 推进 1 日评估：lastScore 记录总分并转 won
        expect(advanceDay(state)).toBe(true);
        expect(state.lastScore).toBe(score.total);
        expect(state.phase).toBe('won');
        // 所有叶簇末端确在目标轮廓内（栅格化基础）
        const ends = nodeEndPositions(state);
        for (const n of state.nodes) {
            if (n.parentId === null || n.children.length > 0)
                continue;
            const end = ends.get(n.id);
            expect(isInsideTarget(level, end.x, end.y)).toBe(true);
        }
    });
    it('defines five escalating levels and clamps the level index', () => {
        expect(LEVELS).toHaveLength(5);
        expect(LEVELS.map((l) => l.shape)).toEqual(['cone', 'cloud', 'slant', 'twin', 'cascade']);
        expect(LEVELS.map((l) => l.name)).toEqual(['圆锥', '层云', '斜干', '双干', '悬崖']);
        for (const level of LEVELS) {
            expect(level.crownW).toBeGreaterThan(0);
            expect(level.crownH).toBeGreaterThan(0);
            expect(level.maxH).toBeGreaterThan(level.minH);
            expect(level.targetLeaves).toBeGreaterThan(0);
        }
        expect(createBonsaiState(1, -3).levelIndex).toBe(0);
        expect(createBonsaiState(1, 99).levelIndex).toBe(4);
        const state = createBonsaiState(1, 2);
        expect(state.phase).toBe('playing');
        expect(state.day).toBe(1);
        expect(state.tickTotal).toBe(0);
        expect(state.health).toBe(100);
        expect(state.sunAngle).toBe(0);
    });
    it('replays identically for the same seed and scripted actions', () => {
        const script = (state) => {
            for (let i = 0; i < 120; i += 1) {
                tickBonsai(state);
                if (i % DAY_TICKS === 0) {
                    water(state);
                    fertilize(state);
                }
                if (i % 17 === 0)
                    setSun(state, Math.sin(i) * 2);
                if (i % 23 === 0) {
                    const target = state.nodes.find((n) => n.parentId !== null && n.children.length > 0);
                    if (target !== undefined)
                        pruneNode(state, target.id);
                }
            }
        };
        const a = createBonsaiState(2024, 0);
        const b = createBonsaiState(2024, 0);
        script(a);
        script(b);
        expect(snapshotTree(a)).toEqual(snapshotTree(b));
        expect(a.lastScore).toBe(b.lastScore);
        expect(a.tickTotal).toBe(b.tickTotal);
        // 不同种子（大概率）长出不同的树
        const c = createBonsaiState(2025, 0);
        script(c);
        expect(snapshotTree(c)).not.toEqual(snapshotTree(a));
    });
    it('survives long tick replays with stable structure invariants', () => {
        const run = (seed) => {
            const state = createBonsaiState(seed, 4);
            for (let i = 0; i < 600; i += 1) {
                tickBonsai(state);
                if (i % 30 === 0)
                    water(state);
                if (i % 45 === 0)
                    fertilize(state);
            }
            return state;
        };
        const a = run(77);
        const b = run(77);
        expect(snapshotTree(a)).toEqual(snapshotTree(b));
        expect(a.lastScore).toBe(b.lastScore);
        expect(a.tickTotal).toBe(600);
        expect(a.day).toBe(Math.floor(600 / DAY_TICKS) + 1);
        // 结构不变量：父 id 恒小于子 id、children 双向一致、深度 = 父深 + 1
        const byId = new Map(a.nodes.map((n) => [n.id, n]));
        for (const n of a.nodes) {
            if (n.parentId === null) {
                expect(n.depth).toBe(0);
                continue;
            }
            expect(n.parentId).toBeLessThan(n.id);
            const parent = byId.get(n.parentId);
            expect(parent.children).toContain(n.id);
            expect(n.depth).toBe(parent.depth + 1);
            expect(n.length).toBeLessThanOrEqual(52);
        }
        expect(a.health).toBeGreaterThan(0);
        expect(a.phase).toBe('playing');
    });
});
