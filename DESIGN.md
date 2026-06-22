# DESIGN.md — helm

## Theme
**默认:暖色浅底(warm paper)。** 场景 = 深夜偏暗房间,主屏深色 IDE,看板半屏在旁用余光瞄。要让眼睛
零点几秒从深色环境里认出状态 → 暖浅底 + 饱和状态色最跳,且主动避开"深蓝监控大屏"的品类反射。
底色压到柔和米白(非纯白)防夜间刺眼。**精修深色变体**作为可切换项,供纯黑环境用户。

## Color(OKLCH;中性全部微偏暖,从不 #000/#fff)
策略:**Restrained 中性 + 功能性语义色**。中性承载 90% 表面,coral 只做品牌/可交互点缀;状态色因
**承载语义**(运行态、事件类型)而存在,不算装饰。

**浅底(默认)**
- `--paper`       oklch(0.972 0.008 75)   /* 柔和暖米白,主背景 */
- `--surface`     oklch(0.995 0.005 75)   /* 略抬升的面 */
- `--sunken`      oklch(0.945 0.010 72)   /* 右栏/输入凹陷面 */
- `--line`        oklch(0.895 0.012 70)   /* 1px 描边 */
- `--ink`         oklch(0.275 0.012 55)   /* 正文 */
- `--ink-muted`   oklch(0.555 0.012 58)   /* 次要文字/时间戳 */
- `--ink-faint`   oklch(0.700 0.010 60)   /* 占位 */

**品牌 / 可交互**
- `--accent`      oklch(0.640 0.140 38)   /* Claude coral,链接/聚焦/可点 */
- `--accent-ink`  oklch(0.510 0.150 35)   /* coral 文字态 */

**语义状态(运行态 + 事件;moderate chroma 不刺)**
- `--run`   oklch(0.660 0.135 52)  /* running / run 事件:暖琥珀-珊瑚,在动 */
- `--ok`    oklch(0.615 0.110 150) /* done / ok */
- `--warn`  oklch(0.740 0.110 85)  /* waiting / warn / 踩坑 */
- `--block` oklch(0.575 0.165 27)  /* blocked / fail:最高优先,叫人 */
- `--info`  oklch(0.620 0.090 235) /* info 事件 */

**深色变体**:同角色、提亮中性反相(paper→oklch(0.20 0.012 65)、ink→oklch(0.92 0.01 70)),
状态色 lightness +0.06、chroma 略降,保持可读。

## Typography
- Sans:`"Inter", -apple-system, system-ui, sans-serif`。UI 与说明。
- Mono:`ui-monospace, "JetBrains Mono", Menlo, monospace`。时间戳、命令、数据、step 序号、计数。
- 阶梯(rem,相邻 ≥1.25 对比,靠 scale+weight 拉层次,不靠颜色):
  `.72 / .8125 / .9375 / 1 / 1.25 / 1.6 / 2.1`。Now 一句话用 1.6/600;区块标题 .8125/600 全大写带字距;
  正文 .9375/400;元信息/时间 mono .78/450。
- 文字块控制在 70ch 内。

## Layout
- **两栏**:左栏 `clamp(320px, 32%, 400px)` 常驻 `position: sticky`,右栏自适应滚动。≤860px 叠成单栏。
- 节奏:用 4 的倍数间距但**有意变化**(8/12/16/24/32),不是处处等 padding。
- **不靠卡片堆砌**:左栏是一个连续面板用细分隔线分区,不是一摞嵌套卡片;右栏时间线靠点轨,不是卡片列表。
- 顶部一条细 `--run` 色进度提示线(整任务进度),克制。

## Components(关键约定)
- **Now**:大字一句话 + 状态 chip(带脉冲点,仅 running 脉冲)+ 当前 step 引用。
- **计划**:有序步骤列表;done=划除+✓、进行中=`--run` 实心圆点+加粗、待办=空心。**用前导标记区分,不用侧边竖条。**
- **操舵区**:视觉上明显"属于你"(暖描边 + 浅 `--accent` 底 + ✎ 标),两个可编辑域:目标、操舵指令。保存即回写。
- **需要你拍板**:醒目但**无 side-stripe**——用整框暖底 + ⚡ 前导 + 计数徽章表达优先级。
- **时间线**:左侧 1px 点轨,事件点用语义色,时间 mono;坑/死路=warn/fail 点。
- **决策 & 假设**:紧凑列表;假设项带 `assumption` 小标(`--warn` 描边),提示"未确认"。
- **产物**:链接 chip / 图片缩略(点开灯箱)/ 数据小表。

## Motion
- 仅 ease-out-expo;不动 layout 属性(用 opacity/transform)。
- running 脉冲点:1.6s opacity 呼吸。新事件进入:120ms 淡入 + 轻微上移。状态变 blocked:顶部线渐变红 + 通知。

## Absolute bans(本项目历史违例,重做必须清掉)
- ❌ 渐变文字(旧版 h1 用了 `background-clip:text`)→ 改纯色 + 字重。
- ❌ 彩色侧边竖条(旧版 hero/callout/timeline 用 `border-left` 粗条)→ 改整框/底色/前导标记。
- ❌ hero-metric 模板、等大卡片网格、玻璃拟态、em dash。
