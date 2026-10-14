# Motion adoption value audit / 运动适配收益评估

2026-10-14。评估完成，产品游戏未修改，未迁入Pet Kit。用户确认先判断收益，不能以库版本和接入率代替必要性。

## 实测

- 正常网络：`artifacts/smoothness-e2e/2026-10-14T14-37-40-368Z/report.json`，真实双隐藏Electron、当前2D形象、隔离账号服务真实UI登录、生产LAN/TLS邀请/授权、真实CDP键盘。自身躲藏移动及准星连续，松键后判定位置误差0，退出停止预测。房主射击画面的像素刷新9.91Hz，客人射击画面3.53Hz。
- 180ms额外poll等待：首轮 `2026-10-14T14-44-07-742Z` 首个自身流畅性断言失败。补全角色互换/停止采集的 `2026-10-14T14-47-27-250Z` **仍失败**：客人自己躲藏连续移动仅70.7%的有效帧在动；房主自身躲藏和双方准星为100%。客人看到对方碎片刷新3.56Hz；最终松键收敛误差0。报告 `ok:false`，不能因为退出、授权和截图检查通过而报流畅性通过。
- 原始发布HTML摘要 `f0439b2ae6c8cf37d2745a14dbe52ff56633ed40227122b548a095361e2b9672`。批次测试只在临时HTML中增加SDK poll前等待，未改变模拟、位置、输入或画面数据。遮挡像素无坐标平移；9项已有运动/遮挡/停止/生命周期测试通过。
- 两轮完整路径均首绘前隐藏，后台截图已检查，自有进程退出。没有本轮3D、物理双机、公网、原生焦点或完整战斗重测。

## 收益判断

优先研究快照发送节奏：`sessions.js` 固定250ms最小发送间隔，100ms发布定时使普通客人刷新约3.5Hz；自己的有界本地预测在延迟累计时也可能用尽500ms领先窗口。前者有刷新实测和代码对应，后者仍为解释候选，不能声称已定位全部根因。

不直接套位置插值/外推：射击方只持有洞口已露出的像素，完整角色位置和图像只属于裁判/拥有者。移动片段、淡入预测轮廓或传输完整姿态会改变瞄准信息与公平性。改善发送节奏与迁移Room是不同事项；当前未证明Room重写值得。后续先做保持遮挡和命中规则的最小节奏实验，再衡量带宽/CPU及更长收包间隔，不能只为通过测试放宽本地预测上限。

## 可复现入口

`PET_DUEL_HOST_REPO=/absolute/host npm run test:motion:audit`，普通与180ms批次两轮，已加入 `test:delivery`。目前批次子项预期揭示未修复缺陷并以非零退出；不是SKIP/绿灯。审计模式会继续收集其余运动路径，在末尾汇总失败；普通smoothness入口仍逐项严格断言。截图/原始轨迹/日志留本地忽略目录，不发布。

English: This audit does not modify the game or adopt Pet Kit. Real hidden-host normal networking passes the existing local body/aim/stop checks, but the guest sees masked opponent pixels at about 3.5Hz. With 180ms additional poll delay, the guest's own hider motion fails the existing continuity assertion (70.7% moving frames); aim and host-local movement remain continuous, and final positions converge. The audit deliberately exits nonzero for that known defect. Test readiness now supports the host's automatic certificate pairing while retaining invitation and capability consent. No physical WAN, 3D or complete-combat coverage is claimed. Prefer a bounded cadence experiment before replacing room management; never reveal or extrapolate hidden opponent poses for cosmetic smoothness.

## 发现与防止复发

Agent在收益评估阶段发现正常快照节奏与批次收包的不同缺口。以前只记录自身正常流畅，不能外推弱网通过；本次把批次路径注册到具名聚合门槛，失败保留。初步审计继续采样时末尾沿用了旧PASS文案，虽然最终ok为false且退出码1仍容易误读；测试已改为明确标注smoothness assertions FAILED，历史报告保持原样，以顶层failures/ok为准。

## 第二阶段：已授权的最小节奏修复

2026-10-14：候选一仅将小快照最小间隔250ms改为75ms（100ms生产定时器），180ms批次测试自身移动83.3%且停止偏差13px，未通过；候选二同时消除收包完成后的额外40ms等待，同路径通过。实现保留40ms最小收包启动间隔防空转，保留220000字节/秒预算与最大6片；不改500ms本地预测上限，也不传/预测完整对手位置。范围：game/sessions.js、tests/sessions.test.cjs、版本及单文件构建。需以最终源码重建产物复验正常/批次/3D与公开规则套件后才交付。

最终2.0.3 HTML SHA-256：`4de6ef8d13570dbc317d1ad4daf27853be1bbc85173d109aa548210327b558ed`。`test:public` 78项通过，含真实publisher的刷新/带宽/遮挡断言，以及现有规则、网络、命中/重赛、560次命令、角色互换与运动边界；构建一致性通过。

- `test:motion:audit` 普通网络：`2026-10-14T15-11-10-499Z`，自身移动100%有效帧变化，停止误差0，客人看到的遮挡快照约10.10Hz。
- 同入口180ms批次：`2026-10-14T15-11-57-755Z`，客人自身移动89.2%（旧版70.7%），停止误差0，客人遮挡快照约10Hz。仍可能有弱网停顿，不能称所有延迟消失。
- 新具名入口 `test:motion:audit:doll`（已纳入delivery）：`2026-10-14T15-16-08-967Z`，真实安装当前3D形象与2D双人、180ms批次，连续性/松键/角色互换/遮挡/退出均通过。后台截图检查与自有进程退出通过。

仅改变发送/收包节奏，无新增房间协议、公共Kit依赖或隐藏位置暴露。原失败报告保留。未运行物理双机、公网、原生焦点及与本改动无关的完整编辑器回归；不以同机延迟注入代替公网证明。

English: Version 2.0.3 ships the bounded cadence fix, without a Room/Motion migration or a larger prediction allowance. Small snapshots now follow the 100ms producer; polling enforces a minimum start interval instead of adding delay after every completed long poll. Byte/part limits and hidden-opponent masking are unchanged. All 78 public checks and actual hidden-host normal, 180ms-batched and 3D-batched motion paths pass. Guest local continuity improves from 70.7% to 89.2% in the 2D batch case, with zero final position error; this does not eliminate all weak-network stalls. Physical WAN is not covered.
