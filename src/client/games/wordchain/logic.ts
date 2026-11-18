/**
 * 词语接龙 WordChain 纯逻辑：内置 300+ 常见双字/三字词库（按类别分组，
 * 每词带首尾字无声调拼音），玩家与 AI 轮流接龙——新词首字须与上词尾字
 * 同音（同字为正接另加奖励）；玩家开局领 5 张手牌且不随回合刷新（死局
 * 重起时双方换牌），可出牌或跳过（跳过送 AI 5 分）；AI 从词库按 seed
 * 策略出词（70% 找到接龙否则跳过）；双方连续跳过即死局，重新起头并
 * 换牌；10 回合高分挑战。全部随机走注入 seed（mulberry32），任何种子
 * 下的整局都可以确定性重放。
 */

/** 单条词语词条：词本体，以及首字/尾字的无声调拼音（同音判定用）。 */
export interface WordEntry {
  /** 双字或三字词本体。 */
  word: string
  /** 首字无声调拼音。 */
  headPy: string
  /** 尾字无声调拼音。 */
  tailPy: string
}

/** 词库分组来源（按类别组织，便于丰富度查阅；游戏只用展平后的 WORDS）。 */
export interface WordGroup {
  /** 类别名（自然/食物/动作/物品……）。 */
  category: string
  /** 该类别下的词条。 */
  words: WordEntry[]
}

/** 按类别分组的词库来源（合计 300+ 词）。 */
export const WORD_GROUPS: readonly WordGroup[] = [
  {
    category: '自然',
    words: [
    { word: '太阳', headPy: 'tai', tailPy: 'yang' },
    { word: '月亮', headPy: 'yue', tailPy: 'liang' },
    { word: '星星', headPy: 'xing', tailPy: 'xing' },
    { word: '云朵', headPy: 'yun', tailPy: 'duo' },
    { word: '风景', headPy: 'feng', tailPy: 'jing' },
    { word: '雨水', headPy: 'yu', tailPy: 'shui' },
    { word: '雪花', headPy: 'xue', tailPy: 'hua' },
    { word: '雷电', headPy: 'lei', tailPy: 'dian' },
    { word: '彩虹', headPy: 'cai', tailPy: 'hong' },
    { word: '山川', headPy: 'shan', tailPy: 'chuan' },
    { word: '河流', headPy: 'he', tailPy: 'liu' },
    { word: '湖泊', headPy: 'hu', tailPy: 'po' },
    { word: '海洋', headPy: 'hai', tailPy: 'yang' },
    { word: '森林', headPy: 'sen', tailPy: 'lin' },
    { word: '草原', headPy: 'cao', tailPy: 'yuan' },
    { word: '沙漠', headPy: 'sha', tailPy: 'mo' },
    { word: '岛屿', headPy: 'dao', tailPy: 'yu' },
    { word: '大地', headPy: 'da', tailPy: 'di' },
    { word: '天空', headPy: 'tian', tailPy: 'kong' },
    { word: '火焰', headPy: 'huo', tailPy: 'yan' },
    { word: '冰川', headPy: 'bing', tailPy: 'chuan' },
    { word: '泉水', headPy: 'quan', tailPy: 'shui' },
    { word: '瀑布', headPy: 'pu', tailPy: 'bu' },
    { word: '岩石', headPy: 'yan', tailPy: 'shi' },
    { word: '泥土', headPy: 'ni', tailPy: 'tu' },
    { word: '闪电', headPy: 'shan', tailPy: 'dian' },
    { word: '露珠', headPy: 'lu', tailPy: 'zhu' },
    { word: '霜冻', headPy: 'shuang', tailPy: 'dong' },
    { word: '迷雾', headPy: 'mi', tailPy: 'wu' },
    { word: '黄昏', headPy: 'huang', tailPy: 'hun' },
    { word: '黎明', headPy: 'li', tailPy: 'ming' },
    { word: '夜晚', headPy: 'ye', tailPy: 'wan' },
    { word: '春天', headPy: 'chun', tailPy: 'tian' },
    { word: '夏天', headPy: 'xia', tailPy: 'tian' },
    { word: '秋天', headPy: 'qiu', tailPy: 'tian' },
    { word: '冬天', headPy: 'dong', tailPy: 'tian' },
    { word: '破晓', headPy: 'po', tailPy: 'xiao' },
    { word: '落叶', headPy: 'luo', tailPy: 'ye' },
    { word: '波浪', headPy: 'bo', tailPy: 'lang' },
    { word: '淋雨', headPy: 'lin', tailPy: 'yu' },
    { word: '阳光', headPy: 'yang', tailPy: 'guang' },
    { word: '尘土', headPy: 'chen', tailPy: 'tu' },
    { word: '池塘', headPy: 'chi', tailPy: 'tang' },
    { word: '颜色', headPy: 'yan', tailPy: 'se' },
    { word: '色彩', headPy: 'se', tailPy: 'cai' },
    { word: '紫色', headPy: 'zi', tailPy: 'se' },
    ],
  },
  {
    category: '食物',
    words: [
    { word: '苹果', headPy: 'ping', tailPy: 'guo' },
    { word: '香蕉', headPy: 'xiang', tailPy: 'jiao' },
    { word: '葡萄', headPy: 'pu', tailPy: 'tao' },
    { word: '西瓜', headPy: 'xi', tailPy: 'gua' },
    { word: '草莓', headPy: 'cao', tailPy: 'mei' },
    { word: '橘子', headPy: 'ju', tailPy: 'zi' },
    { word: '桃子', headPy: 'tao', tailPy: 'zi' },
    { word: '樱桃', headPy: 'ying', tailPy: 'tao' },
    { word: '芒果', headPy: 'mang', tailPy: 'guo' },
    { word: '菠萝', headPy: 'bo', tailPy: 'luo' },
    { word: '米饭', headPy: 'mi', tailPy: 'fan' },
    { word: '面条', headPy: 'mian', tailPy: 'tiao' },
    { word: '饺子', headPy: 'jiao', tailPy: 'zi' },
    { word: '包子', headPy: 'bao', tailPy: 'zi' },
    { word: '馒头', headPy: 'man', tailPy: 'tou' },
    { word: '豆腐', headPy: 'dou', tailPy: 'fu' },
    { word: '鸡蛋', headPy: 'ji', tailPy: 'dan' },
    { word: '牛奶', headPy: 'niu', tailPy: 'nai' },
    { word: '蜂蜜', headPy: 'feng', tailPy: 'mi' },
    { word: '白菜', headPy: 'bai', tailPy: 'cai' },
    { word: '萝卜', headPy: 'luo', tailPy: 'bo' },
    { word: '番茄', headPy: 'fan', tailPy: 'qie' },
    { word: '土豆', headPy: 'tu', tailPy: 'dou' },
    { word: '蘑菇', headPy: 'mo', tailPy: 'gu' },
    { word: '海带', headPy: 'hai', tailPy: 'dai' },
    { word: '虾仁', headPy: 'xia', tailPy: 'ren' },
    { word: '排骨', headPy: 'pai', tailPy: 'gu' },
    { word: '烤鸭', headPy: 'kao', tailPy: 'ya' },
    { word: '月饼', headPy: 'yue', tailPy: 'bing' },
    { word: '汤圆', headPy: 'tang', tailPy: 'yuan' },
    { word: '粽子', headPy: 'zong', tailPy: 'zi' },
    { word: '咖啡', headPy: 'ka', tailPy: 'fei' },
    { word: '奶茶', headPy: 'nai', tailPy: 'cha' },
    { word: '果汁', headPy: 'guo', tailPy: 'zhi' },
    { word: '蛋糕', headPy: 'dan', tailPy: 'gao' },
    { word: '饼干', headPy: 'bing', tailPy: 'gan' },
    { word: '水果', headPy: 'shui', tailPy: 'guo' },
    { word: '茄子', headPy: 'qie', tailPy: 'zi' },
    { word: '豆浆', headPy: 'dou', tailPy: 'jiang' },
    { word: '苦瓜', headPy: 'ku', tailPy: 'gua' },
    { word: '早餐', headPy: 'zao', tailPy: 'can' },
    ],
  },
  {
    category: '动物',
    words: [
    { word: '老虎', headPy: 'lao', tailPy: 'hu' },
    { word: '狮子', headPy: 'shi', tailPy: 'zi' },
    { word: '大象', headPy: 'da', tailPy: 'xiang' },
    { word: '熊猫', headPy: 'xiong', tailPy: 'mao' },
    { word: '猴子', headPy: 'hou', tailPy: 'zi' },
    { word: '兔子', headPy: 'tu', tailPy: 'zi' },
    { word: '老鼠', headPy: 'lao', tailPy: 'shu' },
    { word: '松鼠', headPy: 'song', tailPy: 'shu' },
    { word: '狐狸', headPy: 'hu', tailPy: 'li' },
    { word: '野狼', headPy: 'ye', tailPy: 'lang' },
    { word: '梅花鹿', headPy: 'mei', tailPy: 'lu' },
    { word: '斑马', headPy: 'ban', tailPy: 'ma' },
    { word: '骆驼', headPy: 'luo', tailPy: 'tuo' },
    { word: '山羊', headPy: 'shan', tailPy: 'yang' },
    { word: '绵羊', headPy: 'mian', tailPy: 'yang' },
    { word: '奶牛', headPy: 'nai', tailPy: 'niu' },
    { word: '骏马', headPy: 'jun', tailPy: 'ma' },
    { word: '雄鹰', headPy: 'xiong', tailPy: 'ying' },
    { word: '燕子', headPy: 'yan', tailPy: 'zi' },
    { word: '喜鹊', headPy: 'xi', tailPy: 'que' },
    { word: '乌鸦', headPy: 'wu', tailPy: 'ya' },
    { word: '白鸽', headPy: 'bai', tailPy: 'ge' },
    { word: '蝴蝶', headPy: 'hu', tailPy: 'die' },
    { word: '蜜蜂', headPy: 'mi', tailPy: 'feng' },
    { word: '蚂蚁', headPy: 'ma', tailPy: 'yi' },
    { word: '蜻蜓', headPy: 'qing', tailPy: 'ting' },
    { word: '青蛙', headPy: 'qing', tailPy: 'wa' },
    { word: '乌龟', headPy: 'wu', tailPy: 'gui' },
    { word: '鲤鱼', headPy: 'li', tailPy: 'yu' },
    { word: '鲨鱼', headPy: 'sha', tailPy: 'yu' },
    { word: '海豚', headPy: 'hai', tailPy: 'tun' },
    { word: '企鹅', headPy: 'qi', tailPy: 'e' },
    { word: '毒蛇', headPy: 'du', tailPy: 'she' },
    { word: '鳄鱼', headPy: 'e', tailPy: 'yu' },
    { word: '刺猬', headPy: 'ci', tailPy: 'wei' },
    { word: '萤火虫', headPy: 'ying', tailPy: 'chong' },
    { word: '鸭子', headPy: 'ya', tailPy: 'zi' },
    ],
  },
  {
    category: '动作',
    words: [
    { word: '跑步', headPy: 'pao', tailPy: 'bu' },
    { word: '跳跃', headPy: 'tiao', tailPy: 'yue' },
    { word: '游泳', headPy: 'you', tailPy: 'yong' },
    { word: '飞翔', headPy: 'fei', tailPy: 'xiang' },
    { word: '散步', headPy: 'san', tailPy: 'bu' },
    { word: '站立', headPy: 'zhan', tailPy: 'li' },
    { word: '坐下', headPy: 'zuo', tailPy: 'xia' },
    { word: '躺下', headPy: 'tang', tailPy: 'xia' },
    { word: '拍手', headPy: 'pai', tailPy: 'shou' },
    { word: '握手', headPy: 'wo', tailPy: 'shou' },
    { word: '点头', headPy: 'dian', tailPy: 'tou' },
    { word: '摇头', headPy: 'yao', tailPy: 'tou' },
    { word: '微笑', headPy: 'wei', tailPy: 'xiao' },
    { word: '大哭', headPy: 'da', tailPy: 'ku' },
    { word: '呐喊', headPy: 'na', tailPy: 'han' },
    { word: '欢呼', headPy: 'huan', tailPy: 'hu' },
    { word: '鼓掌', headPy: 'gu', tailPy: 'zhang' },
    { word: '奔跑', headPy: 'ben', tailPy: 'pao' },
    { word: '追逐', headPy: 'zhui', tailPy: 'zhu' },
    { word: '攀登', headPy: 'pan', tailPy: 'deng' },
    { word: '滑冰', headPy: 'hua', tailPy: 'bing' },
    { word: '滑雪', headPy: 'hua', tailPy: 'xue' },
    { word: '划船', headPy: 'hua', tailPy: 'chuan' },
    { word: '骑车', headPy: 'qi', tailPy: 'che' },
    { word: '开车', headPy: 'kai', tailPy: 'che' },
    { word: '唱歌', headPy: 'chang', tailPy: 'ge' },
    { word: '跳舞', headPy: 'tiao', tailPy: 'wu' },
    { word: '绘画', headPy: 'hui', tailPy: 'hua' },
    { word: '书法', headPy: 'shu', tailPy: 'fa' },
    { word: '阅读', headPy: 'yue', tailPy: 'du' },
    { word: '写作', headPy: 'xie', tailPy: 'zuo' },
    { word: '思考', headPy: 'si', tailPy: 'kao' },
    { word: '记忆', headPy: 'ji', tailPy: 'yi' },
    { word: '打球', headPy: 'da', tailPy: 'qiu' },
    { word: '种花', headPy: 'zhong', tailPy: 'hua' },
    { word: '浇水', headPy: 'jiao', tailPy: 'shui' },
    { word: '朗读', headPy: 'lang', tailPy: 'du' },
    { word: '跌倒', headPy: 'die', tailPy: 'dao' },
    { word: '听说', headPy: 'ting', tailPy: 'shuo' },
    { word: '停车', headPy: 'ting', tailPy: 'che' },
    { word: '冲刺', headPy: 'chong', tailPy: 'ci' },
    { word: '读书', headPy: 'du', tailPy: 'shu' },
    { word: '逃跑', headPy: 'tao', tailPy: 'pao' },
    { word: '刮风', headPy: 'gua', tailPy: 'feng' },
    { word: '爬山', headPy: 'pa', tailPy: 'shan' },
    { word: '起床', headPy: 'qi', tailPy: 'chuang' },
    { word: '忘记', headPy: 'wang', tailPy: 'ji' },
    { word: '继续', headPy: 'ji', tailPy: 'xu' },
    { word: '参加', headPy: 'can', tailPy: 'jia' },
    { word: '等待', headPy: 'deng', tailPy: 'dai' },
    { word: '泡茶', headPy: 'pao', tailPy: 'cha' },
    { word: '搬家', headPy: 'ban', tailPy: 'jia' },
    { word: '观察', headPy: 'guan', tailPy: 'cha' },
    { word: '约会', headPy: 'yue', tailPy: 'hui' },
    { word: '说话', headPy: 'shuo', tailPy: 'hua' },
    { word: '了解', headPy: 'liao', tailPy: 'jie' },
    { word: '躲藏', headPy: 'duo', tailPy: 'cang' },
    ],
  },
  {
    category: '物品',
    words: [
    { word: '桌子', headPy: 'zhuo', tailPy: 'zi' },
    { word: '椅子', headPy: 'yi', tailPy: 'zi' },
    { word: '书架', headPy: 'shu', tailPy: 'jia' },
    { word: '台灯', headPy: 'tai', tailPy: 'deng' },
    { word: '沙发', headPy: 'sha', tailPy: 'fa' },
    { word: '床铺', headPy: 'chuang', tailPy: 'pu' },
    { word: '衣柜', headPy: 'yi', tailPy: 'gui' },
    { word: '镜子', headPy: 'jing', tailPy: 'zi' },
    { word: '窗户', headPy: 'chuang', tailPy: 'hu' },
    { word: '大门', headPy: 'da', tailPy: 'men' },
    { word: '钥匙', headPy: 'yao', tailPy: 'chi' },
    { word: '门锁', headPy: 'men', tailPy: 'suo' },
    { word: '雨伞', headPy: 'yu', tailPy: 'san' },
    { word: '背包', headPy: 'bei', tailPy: 'bao' },
    { word: '钱包', headPy: 'qian', tailPy: 'bao' },
    { word: '手表', headPy: 'shou', tailPy: 'biao' },
    { word: '眼镜', headPy: 'yan', tailPy: 'jing' },
    { word: '帽子', headPy: 'mao', tailPy: 'zi' },
    { word: '围巾', headPy: 'wei', tailPy: 'jin' },
    { word: '手套', headPy: 'shou', tailPy: 'tao' },
    { word: '鞋子', headPy: 'xie', tailPy: 'zi' },
    { word: '袜子', headPy: 'wa', tailPy: 'zi' },
    { word: '被子', headPy: 'bei', tailPy: 'zi' },
    { word: '枕头', headPy: 'zhen', tailPy: 'tou' },
    { word: '花瓶', headPy: 'hua', tailPy: 'ping' },
    { word: '茶壶', headPy: 'cha', tailPy: 'hu' },
    { word: '杯子', headPy: 'bei', tailPy: 'zi' },
    { word: '碗筷', headPy: 'wan', tailPy: 'kuai' },
    { word: '刀叉', headPy: 'dao', tailPy: 'cha' },
    { word: '剪刀', headPy: 'jian', tailPy: 'dao' },
    { word: '针线', headPy: 'zhen', tailPy: 'xian' },
    { word: '绳子', headPy: 'sheng', tailPy: 'zi' },
    { word: '箱子', headPy: 'xiang', tailPy: 'zi' },
    { word: '篮子', headPy: 'lan', tailPy: 'zi' },
    { word: '玩具', headPy: 'wan', tailPy: 'ju' },
    { word: '礼物', headPy: 'li', tailPy: 'wu' },
    { word: '布鞋', headPy: 'bu', tailPy: 'xie' },
    { word: '拖鞋', headPy: 'tuo', tailPy: 'xie' },
    { word: '外套', headPy: 'wai', tailPy: 'tao' },
    { word: '口袋', headPy: 'kou', tailPy: 'dai' },
    { word: '仓库', headPy: 'cang', tailPy: 'ku' },
    { word: '讲台', headPy: 'jiang', tailPy: 'tai' },
    { word: '座位', headPy: 'zuo', tailPy: 'wei' },
    { word: '房间', headPy: 'fang', tailPy: 'jian' },
    { word: '铁路', headPy: 'tie', tailPy: 'lu' },
    { word: '列车', headPy: 'lie', tailPy: 'che' },
    { word: '赛车', headPy: 'sai', tailPy: 'che' },
    { word: '巴士', headPy: 'ba', tailPy: 'shi' },
    ],
  },
  {
    category: '身心',
    words: [
    { word: '眼睛', headPy: 'yan', tailPy: 'jing' },
    { word: '耳朵', headPy: 'er', tailPy: 'duo' },
    { word: '鼻子', headPy: 'bi', tailPy: 'zi' },
    { word: '嘴巴', headPy: 'zui', tailPy: 'ba' },
    { word: '牙齿', headPy: 'ya', tailPy: 'chi' },
    { word: '头发', headPy: 'tou', tailPy: 'fa' },
    { word: '肩膀', headPy: 'jian', tailPy: 'bang' },
    { word: '手臂', headPy: 'shou', tailPy: 'bi' },
    { word: '手指', headPy: 'shou', tailPy: 'zhi' },
    { word: '心脏', headPy: 'xin', tailPy: 'zang' },
    { word: '快乐', headPy: 'kuai', tailPy: 'le' },
    { word: '悲伤', headPy: 'bei', tailPy: 'shang' },
    { word: '愤怒', headPy: 'fen', tailPy: 'nu' },
    { word: '惊讶', headPy: 'jing', tailPy: 'ya' },
    { word: '害怕', headPy: 'hai', tailPy: 'pa' },
    { word: '勇气', headPy: 'yong', tailPy: 'qi' },
    { word: '耐心', headPy: 'nai', tailPy: 'xin' },
    { word: '友谊', headPy: 'you', tailPy: 'yi' },
    { word: '爱情', headPy: 'ai', tailPy: 'qing' },
    { word: '希望', headPy: 'xi', tailPy: 'wang' },
    { word: '梦想', headPy: 'meng', tailPy: 'xiang' },
    { word: '回忆', headPy: 'hui', tailPy: 'yi' },
    { word: '思念', headPy: 'si', tailPy: 'nian' },
    { word: '祝福', headPy: 'zhu', tailPy: 'fu' },
    { word: '温暖', headPy: 'wen', tailPy: 'nuan' },
    { word: '孤独', headPy: 'gu', tailPy: 'du' },
    { word: '幸福', headPy: 'xing', tailPy: 'fu' },
    { word: '自由', headPy: 'zi', tailPy: 'you' },
    { word: '骄傲', headPy: 'jiao', tailPy: 'ao' },
    { word: '谦虚', headPy: 'qian', tailPy: 'xu' },
    { word: '诚实', headPy: 'cheng', tailPy: 'shi' },
    { word: '善良', headPy: 'shan', tailPy: 'liang' },
    { word: '智慧', headPy: 'zhi', tailPy: 'hui' },
    { word: '灵感', headPy: 'ling', tailPy: 'gan' },
    { word: '激情', headPy: 'ji', tailPy: 'qing' },
    { word: '宁静', headPy: 'ning', tailPy: 'jing' },
    { word: '努力', headPy: 'nu', tailPy: 'li' },
    { word: '需要', headPy: 'xu', tailPy: 'yao' },
    { word: '认真', headPy: 'ren', tailPy: 'zhen' },
    { word: '想念', headPy: 'xiang', tailPy: 'nian' },
    { word: '永远', headPy: 'yong', tailPy: 'yuan' },
    { word: '干净', headPy: 'gan', tailPy: 'jing' },
    { word: '辛苦', headPy: 'xin', tailPy: 'ku' },
    { word: '安静', headPy: 'an', tailPy: 'jing' },
    { word: '忙碌', headPy: 'mang', tailPy: 'lu' },
    { word: '漂亮', headPy: 'piao', tailPy: 'liang' },
    { word: '乐观', headPy: 'le', tailPy: 'guan' },
    { word: '高兴', headPy: 'gao', tailPy: 'xing' },
    { word: '喜欢', headPy: 'xi', tailPy: 'huan' },
    { word: '母亲', headPy: 'mu', tailPy: 'qin' },
    { word: '亲戚', headPy: 'qin', tailPy: 'qi' },
    { word: '别人', headPy: 'bie', tailPy: 'ren' },
    { word: '宝贝', headPy: 'bao', tailPy: 'bei' },
    { word: '少年', headPy: 'shao', tailPy: 'nian' },
    { word: '掌声', headPy: 'zhang', tailPy: 'sheng' },
    ],
  },
  {
    category: '场所',
    words: [
    { word: '火车', headPy: 'huo', tailPy: 'che' },
    { word: '飞机', headPy: 'fei', tailPy: 'ji' },
    { word: '轮船', headPy: 'lun', tailPy: 'chuan' },
    { word: '帆船', headPy: 'fan', tailPy: 'chuan' },
    { word: '地铁', headPy: 'di', tailPy: 'tie' },
    { word: '公交', headPy: 'gong', tailPy: 'jiao' },
    { word: '出租车', headPy: 'chu', tailPy: 'che' },
    { word: '自行车', headPy: 'zi', tailPy: 'che' },
    { word: '摩托车', headPy: 'mo', tailPy: 'che' },
    { word: '桥梁', headPy: 'qiao', tailPy: 'liang' },
    { word: '隧道', headPy: 'sui', tailPy: 'dao' },
    { word: '车站', headPy: 'che', tailPy: 'zhan' },
    { word: '机场', headPy: 'ji', tailPy: 'chang' },
    { word: '港口', headPy: 'gang', tailPy: 'kou' },
    { word: '公园', headPy: 'gong', tailPy: 'yuan' },
    { word: '广场', headPy: 'guang', tailPy: 'chang' },
    { word: '学校', headPy: 'xue', tailPy: 'xiao' },
    { word: '医院', headPy: 'yi', tailPy: 'yuan' },
    { word: '工厂', headPy: 'gong', tailPy: 'chang' },
    { word: '商店', headPy: 'shang', tailPy: 'dian' },
    { word: '市场', headPy: 'shi', tailPy: 'chang' },
    { word: '银行', headPy: 'yin', tailPy: 'hang' },
    { word: '邮局', headPy: 'you', tailPy: 'ju' },
    { word: '图书馆', headPy: 'tu', tailPy: 'guan' },
    { word: '博物馆', headPy: 'bo', tailPy: 'guan' },
    { word: '动物园', headPy: 'dong', tailPy: 'yuan' },
    { word: '电影院', headPy: 'dian', tailPy: 'yuan' },
    { word: '超市', headPy: 'chao', tailPy: 'shi' },
    { word: '饭店', headPy: 'fan', tailPy: 'dian' },
    { word: '宾馆', headPy: 'bin', tailPy: 'guan' },
    { word: '教室', headPy: 'jiao', tailPy: 'shi' },
    { word: '操场', headPy: 'cao', tailPy: 'chang' },
    { word: '庭院', headPy: 'ting', tailPy: 'yuan' },
    { word: '城堡', headPy: 'cheng', tailPy: 'bao' },
    { word: '宫殿', headPy: 'gong', tailPy: 'dian' },
    { word: '灯塔', headPy: 'deng', tailPy: 'ta' },
    { word: '道路', headPy: 'dao', tailPy: 'lu' },
    { word: '剧场', headPy: 'ju', tailPy: 'chang' },
    ],
  },
  {
    category: '文化',
    words: [
    { word: '数学', headPy: 'shu', tailPy: 'xue' },
    { word: '语文', headPy: 'yu', tailPy: 'wen' },
    { word: '英语', headPy: 'ying', tailPy: 'yu' },
    { word: '物理', headPy: 'wu', tailPy: 'li' },
    { word: '化学', headPy: 'hua', tailPy: 'xue' },
    { word: '生物', headPy: 'sheng', tailPy: 'wu' },
    { word: '历史', headPy: 'li', tailPy: 'shi' },
    { word: '地理', headPy: 'di', tailPy: 'li' },
    { word: '音乐', headPy: 'yin', tailPy: 'yue' },
    { word: '美术', headPy: 'mei', tailPy: 'shu' },
    { word: '体育', headPy: 'ti', tailPy: 'yu' },
    { word: '文学', headPy: 'wen', tailPy: 'xue' },
    { word: '哲学', headPy: 'zhe', tailPy: 'xue' },
    { word: '医学', headPy: 'yi', tailPy: 'xue' },
    { word: '法学', headPy: 'fa', tailPy: 'xue' },
    { word: '诗歌', headPy: 'shi', tailPy: 'ge' },
    { word: '散文', headPy: 'san', tailPy: 'wen' },
    { word: '小说', headPy: 'xiao', tailPy: 'shuo' },
    { word: '戏剧', headPy: 'xi', tailPy: 'ju' },
    { word: '声乐', headPy: 'sheng', tailPy: 'yue' },
    { word: '舞蹈', headPy: 'wu', tailPy: 'dao' },
    { word: '摄影', headPy: 'she', tailPy: 'ying' },
    { word: '雕塑', headPy: 'diao', tailPy: 'su' },
    { word: '棋牌', headPy: 'qi', tailPy: 'pai' },
    { word: '对联', headPy: 'dui', tailPy: 'lian' },
    { word: '灯谜', headPy: 'deng', tailPy: 'mi' },
    { word: '相声', headPy: 'xiang', tailPy: 'sheng' },
    { word: '皮影', headPy: 'pi', tailPy: 'ying' },
    { word: '功夫', headPy: 'gong', tailPy: 'fu' },
    { word: '太极', headPy: 'tai', tailPy: 'ji' },
    { word: '汉字', headPy: 'han', tailPy: 'zi' },
    { word: '知识', headPy: 'zhi', tailPy: 'shi' },
    ],
  },
  {
    category: '生活',
    words: [
    { word: '早晨', headPy: 'zao', tailPy: 'chen' },
    { word: '中午', headPy: 'zhong', tailPy: 'wu' },
    { word: '傍晚', headPy: 'bang', tailPy: 'wan' },
    { word: '节日', headPy: 'jie', tailPy: 'ri' },
    { word: '春节', headPy: 'chun', tailPy: 'jie' },
    { word: '婚礼', headPy: 'hun', tailPy: 'li' },
    { word: '生日', headPy: 'sheng', tailPy: 'ri' },
    { word: '假期', headPy: 'jia', tailPy: 'qi' },
    { word: '旅行', headPy: 'lv', tailPy: 'xing' },
    { word: '冒险', headPy: 'mao', tailPy: 'xian' },
    { word: '秘密', headPy: 'mi', tailPy: 'mi' },
    { word: '故事', headPy: 'gu', tailPy: 'shi' },
    { word: '童话', headPy: 'tong', tailPy: 'hua' },
    { word: '神话', headPy: 'shen', tailPy: 'hua' },
    { word: '谜语', headPy: 'mi', tailPy: 'yu' },
    { word: '笑话', headPy: 'xiao', tailPy: 'hua' },
    { word: '噪音', headPy: 'zao', tailPy: 'yin' },
    { word: '通知', headPy: 'tong', tailPy: 'zhi' },
    { word: '消息', headPy: 'xiao', tailPy: 'xi' },
    { word: '电话', headPy: 'dian', tailPy: 'hua' },
    { word: '电脑', headPy: 'dian', tailPy: 'nao' },
    { word: '键盘', headPy: 'jian', tailPy: 'pan' },
    { word: '屏幕', headPy: 'ping', tailPy: 'mu' },
    { word: '网络', headPy: 'wang', tailPy: 'luo' },
    { word: '相机', headPy: 'xiang', tailPy: 'ji' },
    { word: '电池', headPy: 'dian', tailPy: 'chi' },
    { word: '火柴', headPy: 'huo', tailPy: 'chai' },
    { word: '蜡烛', headPy: 'la', tailPy: 'zhu' },
    { word: '肥皂', headPy: 'fei', tailPy: 'zao' },
    { word: '毛巾', headPy: 'mao', tailPy: 'jin' },
    { word: '缺少', headPy: 'que', tailPy: 'shao' },
    { word: '奥秘', headPy: 'ao', tailPy: 'mi' },
    { word: '年轻', headPy: 'nian', tailPy: 'qing' },
    { word: '精彩', headPy: 'jing', tailPy: 'cai' },
    { word: '穿梭', headPy: 'chuan', tailPy: 'suo' },
    { word: '留学', headPy: 'liu', tailPy: 'xue' },
    { word: '远方', headPy: 'yuan', tailPy: 'fang' },
    { word: '魔法', headPy: 'mo', tailPy: 'fa' },
    { word: '空调', headPy: 'kong', tailPy: 'tiao' },
    { word: '主意', headPy: 'zhu', tailPy: 'yi' },
    { word: '差别', headPy: 'cha', tailPy: 'bie' },
    { word: '感谢', headPy: 'gan', tailPy: 'xie' },
    { word: '互相', headPy: 'hu', tailPy: 'xiang' },
    { word: '录音', headPy: 'lu', tailPy: 'yin' },
    { word: '马上', headPy: 'ma', tailPy: 'shang' },
    { word: '恶劣', headPy: 'e', tailPy: 'lie' },
    { word: '额外', headPy: 'e', tailPy: 'wai' },
    { word: '社会', headPy: 'she', tailPy: 'hui' },
    { word: '力气', headPy: 'li', tailPy: 'qi' },
    { word: '寒假', headPy: 'han', tailPy: 'jia' },
    { word: '歌声', headPy: 'ge', tailPy: 'sheng' },
    { word: '发烧', headPy: 'fa', tailPy: 'shao' },
    { word: '考试', headPy: 'kao', tailPy: 'shi' },
    { word: '衣服', headPy: 'yi', tailPy: 'fu' },
    { word: '球队', headPy: 'qiu', tailPy: 'dui' },
    { word: '投票', headPy: 'tou', tailPy: 'piao' },
    { word: '小心', headPy: 'xiao', tailPy: 'xin' },
    { word: '家庭', headPy: 'jia', tailPy: 'ting' },
    { word: '桂花', headPy: 'gui', tailPy: 'hua' },
    { word: '所以', headPy: 'suo', tailPy: 'yi' },
    { word: '表演', headPy: 'biao', tailPy: 'yan' },
    { word: '今天', headPy: 'jin', tailPy: 'tian' },
    { word: '平安', headPy: 'ping', tailPy: 'an' },
    { word: '鲜花', headPy: 'xian', tailPy: 'hua' },
    { word: '帮忙', headPy: 'bang', tailPy: 'mang' },
    { word: '比赛', headPy: 'bi', tailPy: 'sai' },
    { word: '上班', headPy: 'shang', tailPy: 'ban' },
    { word: '清晨', headPy: 'qing', tailPy: 'chen' },
    { word: '服装', headPy: 'fu', tailPy: 'zhuang' },
    { word: '会议', headPy: 'hui', tailPy: 'yi' },
    { word: '战士', headPy: 'zhan', tailPy: 'shi' },
    { word: '航行', headPy: 'hang', tailPy: 'xing' },
    { word: '踏青', headPy: 'ta', tailPy: 'qing' },
    { word: '文件', headPy: 'wen', tailPy: 'jian' },
    { word: '塑料', headPy: 'su', tailPy: 'liao' },
    { word: '排球', headPy: 'pai', tailPy: 'qiu' },
    { word: '练习', headPy: 'lian', tailPy: 'xi' },
    { word: '声音', headPy: 'sheng', tailPy: 'yin' },
    { word: '日记', headPy: 'ri', tailPy: 'ji' },
    { word: '脑海', headPy: 'nao', tailPy: 'hai' },
    { word: '盘子', headPy: 'pan', tailPy: 'zi' },
    { word: '目标', headPy: 'mu', tailPy: 'biao' },
    { word: '柴火', headPy: 'chai', tailPy: 'huo' },
    { word: '吞咽', headPy: 'tun', tailPy: 'ye' },
    { word: '葬礼', headPy: 'zang', tailPy: 'li' },
    { word: '对话', headPy: 'dui', tailPy: 'hua' },
    { word: '装饰', headPy: 'zhuang', tailPy: 'shi' },
    { word: '娃娃', headPy: 'wa', tailPy: 'wa' },
    ],
  },
].map(g => ({ category: g.category, words: g.words }))

/** 展平后的完整词库（发牌与 AI 取词都在这里进行）。 */
export const WORDS: readonly WordEntry[] = WORD_GROUPS.flatMap(g => g.words)

/** 总回合数（每回合 = 玩家一动 + AI 一动）。 */
export const ROUNDS = 10
/** 手牌候选数量（整局的全部弹药，不随回合刷新）。 */
export const HAND_SIZE = 5
/** 玩家跳过时 AI 得到的分数。 */
export const SKIP_GIFT = 5
/** AI 找到接龙的概率（其余情况跳过）。 */
export const AI_PLAY_RATE = 0.7
/** 接出基础分。 */
export const BASE_GAIN = 10
/** 链长加成：链上每多一词（每 +1 链）加的分。 */
export const CHAIN_STEP = 2
/** 同音（不同字）接龙的奖励分。 */
export const HOMOPHONE_BONUS = 5
/** 首字与尾字完全相同（非同音）的奖励分。 */
export const EXACT_BONUS = 5
/** 同字接在同字奖励之外「额外」的加成（合计比同音高 5）。 */
export const EXACT_EXTRA_BONUS = 5

/** 接龙判定结果：exact 同字正接 / homophone 同音不同字 / null 不可接。 */
export type LinkKind = 'exact' | 'homophone'

/** mulberry32 确定性随机数发生器。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 接龙判定：上一词尾字与下一词首字同字为 exact，同音不同字为
 * homophone，否则不可接。
 * @param prev - 链上上一词。
 * @param next - 待接的词。
 * @returns 接法，或 null 表示接不上。
 */
export function linkKind(prev: WordEntry, next: WordEntry): LinkKind | null {
  const tail = prev.word.charAt(prev.word.length - 1)
  const head = next.word.charAt(0)
  if (tail === head) return 'exact'
  if (prev.tailPy === next.headPy && prev.tailPy !== '') return 'homophone'
  return null
}

/**
 * 接龙得分：基础 10 + 链长加成（每 +1 链 +2）；同音接 +5；首字完全相同
 * （非同音）+5 且额外 +5（合计 +10）。
 * @param kind - 接法。
 * @param chainPos - 新词在链中的位置（链首为 1）。
 * @returns 精确得分。
 */
export function gainFor(kind: LinkKind, chainPos: number): number {
  const bonus = kind === 'exact' ? EXACT_BONUS + EXACT_EXTRA_BONUS : HOMOPHONE_BONUS
  return BASE_GAIN + CHAIN_STEP * (chainPos - 1) + bonus
}

/** AI 的一步棋描述（渲染层做动画与提示用）。 */
export interface AiMove {
  type: 'play' | 'skip'
  /** 出词时的词条（type 为 play 时有效）。 */
  entry?: WordEntry
  /** 出词时的接法。 */
  kind?: LinkKind
  /** 本次得分。 */
  gain: number
}

/** 一局 match 的全部可变状态（rng 注入，纯数据可重放）。 */
export interface MatchState {
  /** 当前回合（1..ROUNDS）。 */
  round: number
  /** playing 进行中 / over 十回合结束。 */
  phase: 'playing' | 'over'
  /** 当前链条（chain[0] 为起头词）。 */
  chain: WordEntry[]
  /** 玩家手牌（出掉即移除，只有死局重起才换牌）。 */
  hand: WordEntry[]
  /** 已用过的词（不得重复出）。 */
  used: Set<string>
  playerScore: number
  aiScore: number
  /** 双方连续跳过计数（≥2 触发死局重起并换牌）。 */
  consecutiveSkips: number
  /** 死局重起次数。 */
  restarts: number
  /** AI 最近一步（渲染层展示）。 */
  aiLastMove: AiMove | null
  /** 注入的随机流。 */
  rng: () => number
}

function pickUnused(state: MatchState): WordEntry {
  for (let guard = 0; guard < 1000; guard += 1) {
    const entry = WORDS[Math.floor(state.rng() * WORDS.length)]!
    if (!state.used.has(entry.word)) return entry
  }
  // 兜底：顺序扫描第一个未用的（极小库时才可达）。
  return WORDS.find(e => !state.used.has(e.word)) ?? WORDS[0]!
}

/** 链条尾部的词（链为空时取库里第一条，仅类型兜底）。 */
export function chainTail(state: MatchState): WordEntry {
  return state.chain[state.chain.length - 1] ?? WORDS[0]!
}

/** 手牌中可接当前链尾的下标列表。 */
export function playableIndices(state: MatchState): number[] {
  const tail = chainTail(state)
  const out: number[] = []
  state.hand.forEach((card, i) => {
    if (linkKind(tail, card) !== null) out.push(i)
  })
  return out
}

/**
 * 发 5 张手牌（确定性）：对未用词下标做局部 Fisher–Yates 洗牌取前 5
 * 张；若洗出的 5 张全部接不上且库中还有可接的未用词，则随机换入一张
 * 可接的，保证玩家绝大多数回合有牌可出。全程有界，任何 rng 都不会死
 * 循环。
 * @param state - 比赛状态（就地更新 hand）。
 */
export function dealHand(state: MatchState): void {
  const unused = WORDS.filter(e => !state.used.has(e.word))
  const idxs = unused.map((_, i) => i)
  const draws = Math.min(idxs.length, HAND_SIZE * 12)
  for (let i = 0; i < draws; i += 1) {
    const j = i + Math.floor(state.rng() * (idxs.length - i))
    const t = idxs[i]!
    idxs[i] = idxs[j]!
    idxs[j] = t
  }
  const hand = idxs.slice(0, Math.min(HAND_SIZE, unused.length)).map(i => unused[i]!)
  const tail = chainTail(state)
  if (hand.length === HAND_SIZE && !hand.some(c => linkKind(tail, c) !== null)) {
    const matches = unused.filter(e => linkKind(tail, e) !== null && !hand.includes(e))
    if (matches.length > 0) {
      const pick = matches[Math.floor(state.rng() * matches.length)]!
      hand[Math.floor(state.rng() * HAND_SIZE)] = pick
    }
  }
  state.hand = hand
}

/** 死局重起：从未用词里随机挑一条做新链首，并给双方换一手牌。 */
export function restartChain(state: MatchState): void {
  const head = pickUnused(state)
  state.chain = [head]
  state.used.add(head.word)
  state.consecutiveSkips = 0
  dealHand(state)
}

/**
 * AI 一步（确定性）：收集可接的未用词，rng < AI_PLAY_RATE 时按 rng 挑一
 * 条接上，否则跳过。
 * @param state - 比赛状态（就地更新链与分数）。
 * @returns 这一步的描述。
 */
export function aiTurn(state: MatchState): AiMove {
  const tail = chainTail(state)
  const matches = WORDS.filter(e => !state.used.has(e.word) && linkKind(tail, e) !== null)
  if (matches.length > 0 && state.rng() < AI_PLAY_RATE) {
    const entry = matches[Math.floor(state.rng() * matches.length)]!
    const kind = linkKind(tail, entry)!
    const gain = gainFor(kind, state.chain.length + 1)
    state.chain.push(entry)
    state.used.add(entry.word)
    state.aiScore += gain
    state.consecutiveSkips = 0
    const move: AiMove = { type: 'play', entry, kind, gain }
    state.aiLastMove = move
    return move
  }
  state.consecutiveSkips += 1
  const move: AiMove = { type: 'skip', gain: 0 }
  state.aiLastMove = move
  return move
}

/** 双方都跳过后死局重起并换牌（aiTurn 之后由行动函数调用）。 */
function resolveDeadlock(state: MatchState): void {
  if (state.consecutiveSkips >= 2) {
    restartChain(state)
    state.restarts += 1
  }
}

/** 玩家行动之后的共同收尾：AI 行动 → 死局处理 → 回合推进（手牌不刷新）。 */
function finishTurn(state: MatchState): void {
  aiTurn(state)
  resolveDeadlock(state)
  state.round += 1
  if (state.round > ROUNDS) state.phase = 'over'
}

/**
 * 玩家从手牌出词接龙（出掉的牌移出手牌，其余保留）。
 * @param state - 比赛状态。
 * @param handIndex - 手牌下标（0..4）。
 * @returns ok 是否成功，gain 得分，kind 接法。
 */
export function playerPlay(
  state: MatchState, handIndex: number,
): { ok: boolean, gain: number, kind: LinkKind | null } {
  if (state.phase !== 'playing') return { ok: false, gain: 0, kind: null }
  const card = state.hand[handIndex]
  if (card === undefined) return { ok: false, gain: 0, kind: null }
  const kind = linkKind(chainTail(state), card)
  if (kind === null) return { ok: false, gain: 0, kind: null }
  const gain = gainFor(kind, state.chain.length + 1)
  state.chain.push(card)
  state.used.add(card.word)
  state.hand.splice(handIndex, 1)
  state.playerScore += gain
  state.consecutiveSkips = 0
  finishTurn(state)
  return { ok: true, gain, kind }
}

/**
 * 玩家跳过：AI 得 SKIP_GIFT 分，随后 AI 行动（双方连跳触发死局重起换
 * 牌）。
 * @param state - 比赛状态。
 * @returns AI 这一步的描述。
 */
export function playerSkip(state: MatchState): AiMove {
  state.aiScore += SKIP_GIFT
  state.consecutiveSkips += 1
  finishTurn(state)
  return state.aiLastMove!
}

/**
 * 建立一场 match：起头一条链、发 5 张手牌（全部由 seed 决定）。
 * @param seed - 种子（同一 seed 得到完全相同的局面与走向）。
 * @returns 初始比赛状态。
 */
export function createMatch(seed: number): MatchState {
  const state: MatchState = {
    round: 1,
    phase: 'playing',
    chain: [],
    hand: [],
    used: new Set<string>(),
    playerScore: 0,
    aiScore: 0,
    consecutiveSkips: 0,
    restarts: 0,
    aiLastMove: null,
    rng: mulberry32(seed),
  }
  const head = pickUnused(state)
  state.chain = [head]
  state.used.add(head.word)
  dealHand(state)
  return state
}

/** 重放对比快照：与随机无关的可比较纯数据（测试确定性用）。 */
export function snapshot(state: MatchState): {
  round: number, phase: string, chain: string[], hand: string[],
  playerScore: number, aiScore: number, restarts: number,
} {
  return {
    round: state.round,
    phase: state.phase,
    chain: state.chain.map(e => e.word),
    hand: state.hand.map(e => e.word),
    playerScore: state.playerScore,
    aiScore: state.aiScore,
    restarts: state.restarts,
  }
}

/** 记录下来的玩家动作（序列化重放用）。 */
export interface RecordedAction {
  type: 'play' | 'skip'
  /** type 为 play 时的手牌下标。 */
  handIndex?: number
}

/**
 * 按记录的动作序列重放整局：AI、发牌、死局全部由同一 seed 推导，动作
 * 相同则每个快照都相同。
 * @param seed - 比赛种子。
 * @param actions - 玩家动作序列。
 * @returns 每步之后的快照序列。
 */
export function replayMatch(seed: number, actions: readonly RecordedAction[]): Array<ReturnType<typeof snapshot>> {
  const state = createMatch(seed)
  const frames: Array<ReturnType<typeof snapshot>> = []
  for (const action of actions) {
    if (state.phase !== 'playing') break
    if (action.type === 'play') playerPlay(state, action.handIndex ?? -1)
    else playerSkip(state)
    frames.push(snapshot(state))
  }
  return frames
}

/**
 * 确定性整局脚本（测试重放用）：每回合一律出第一张可接的手牌，无牌可
 * 接则跳过，直到终局或动作数用尽。
 * @param seed - 比赛种子。
 * @param maxTurns - 最多执行的玩家回合数（防死循环）。
 * @returns 记录的动作序列与每步之后的快照序列。
 */
export function playSkipScript(seed: number, maxTurns: number): {
  actions: RecordedAction[]
  snapshots: Array<ReturnType<typeof snapshot>>
} {
  const state = createMatch(seed)
  const actions: RecordedAction[] = []
  const snapshots: Array<ReturnType<typeof snapshot>> = []
  for (let i = 0; i < maxTurns && state.phase === 'playing'; i += 1) {
    const idx = playableIndices(state)[0]
    if (idx === undefined) {
      playerSkip(state)
      actions.push({ type: 'skip' })
    } else {
      playerPlay(state, idx)
      actions.push({ type: 'play', handIndex: idx })
    }
    snapshots.push(snapshot(state))
  }
  return { actions, snapshots }
}

/** 终局判定：玩家胜 / AI 胜 / 平局；未结束时为 null。 */
export function finalResult(state: MatchState): 'player' | 'ai' | 'draw' | null {
  if (state.phase !== 'over') return null
  if (state.playerScore > state.aiScore) return 'player'
  if (state.aiScore > state.playerScore) return 'ai'
  return 'draw'
}
