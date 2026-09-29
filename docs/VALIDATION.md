# 验证说明 / Validation

## Public gate / 自包含门禁

`npm run test:public` runs geometry, character normalization, match rules, scaling/storage, feedback, session encoding/authority, fixed-pose rules, doll asset decoding, local motion, real HTTP networking, service lifecycle, SDK adapter contracts, and exact HTML rebuild verification. No host checkout, photos, credentials, or character packs are needed.

`npm run test:public` 包含上述核心、真实 HTTP 网络、服务生命周期、SDK 适配和构建一致性检查，不依赖私有宿主或素材。

## Real host gate / 真实宿主门禁

All windows must be hidden before first paint with isolated profiles. Real input and assertions use CDP. A live background screencast keeps the compositor active for motion measurements without changing the game clock. OS keystore calls use a disposable AES fixture; actual discovery, transport, invitation consent and game code remain real.

宿主依赖通过 `PET_DUEL_HOST_REPO` 指定。测试使用隔离数据和首帧前隐藏窗口；真实 CDP 输入；运动测量使用后台持续帧捕获防止隐藏窗口节流，不改游戏时钟。系统钥匙串用一次性 AES 夹具，发现、传输、邀请确认和游戏代码是真实路径。

```sh
# Supply paths to your existing authorized local resources.
export PET_DUEL_HOST_REPO=/path/to/host-checkout
export PET_DUEL_PACKS_DIR=/path/to/local-doll-fixtures
npm run test:e2e:smoothness
npm run test:e2e:smoothness:doll
# Full development acceptance, including pose persistence and render coverage:
npm run test:delivery
```

`test:delivery` additionally includes foundation, current-character, doll-render, pose-lock/restart persistence and file-send/invitation acceptance. It requires the host's test helpers and built UI. Missing host/assets fail; these external tests are not part of the self-contained public gate. Reports and screenshots remain local in ignored evidence/artifact directories and must not be published without a content review.

`test:delivery` 还覆盖基础能力、当前角色、玩偶渲染、姿势锁定/重启持久化、真实发送与邀请，需要宿主测试助手和已构建界面。缺资源失败。报告、日志和截图仅写入本地忽略目录，公开前需单独检查。

## Coverage boundaries / 范围边界

The initial public packaging reruns the public gate and 2D/3D smoothness delivery paths against its exact release HTML. It does not claim a fresh run of every host gate. These paths measure local hider body/marker and aim motion, final authority convergence, leaving, and first-use file delivery/consent. Shooter-visible fragments remain snapshot-paced (about 10 Hz for the host and 3.5 Hz for the guest in the earlier audit). Physical two-machine networking, native Windows launch, OS focus and desktop compositing are not proven by hidden tests.

首次公开打包重跑自包含门禁与 2D/3D 流畅度真实投递路径，使用实际待发布 HTML；不声称本轮重跑全部宿主门禁。射击方碎片仍受快照限制（前次审计宿主约 10Hz、客端约 3.5Hz）。未覆盖物理双机、Windows 原生启动、系统焦点和桌面合成。

Historical art-sample checks, pre-pose-lock game E2E, and legacy failure-reproduction scripts remain intact in the maintainer's local version archive; they are not active tests of this version. Current motion and pose-lock regressions remain in named aggregate gates. This export removes no assertions from their historical records.

旧美术样板、旧局内可换姿势规则的 E2E、历史版本失败重放，连同原源码完整保留在维护者本地版本归档。当前版本继续保留 motion 和 pose-lock 回归并挂具名汇总门禁。

## 2.0.1 release evidence / 发布复验

2026-09-27: all 75 self-contained tests passed (0 failed / 0 skipped); exact HTML rebuild passed. Both real hidden-host delivery paths passed: 2D + 2D and actual 3D doll + 2D. Each verified file-byte identity, first-use pairing/consent, roles, real keyboard movement/aim, final position convergence, leaving and process cleanup. No uncaught renderer exceptions. Background screenshots were inspected locally; no private screenshots are published.

2.0.1 单文件 SHA-256：`a52eed6bb1bb91937cefb7f96cee6019c8a78d030213bc8340ef0107143ffb36`，725286 字节。公开打包只增加许可注释，游戏执行内容与已修复版本逐字相同。75 项测试、2D 与 3D 真实双实例复验均通过；未捕获渲染异常为 0。

## 2.0.2 release evidence / 发布复验

2.0.2 单文件 SHA-256：`f0439b2ae6c8cf37d2745a14dbe52ff56633ed40227122b548a095361e2b9672`，725689 字节（`npm run build:check` 通过）。`npm test` 全部通过，新增「一条消息出错不会卡住收消息」「同一局超过 512 次操作不会卡住裁判」两项；会话测试替身改为按读取位置返回事件（与宿主一致）。两台真实宿主的对局测试（`test:game-e2e`）通过。宿主仓库的 peer-session 投递端到端在本版与未修改的 2.0.1 上都会在不同步骤偶发失败（选文件、输入框焦点、寻找可命中像素），与本次修改无关。

Health-check replay (vibe_contents/net-checkup, hide reliable-exhaust, real host session code): 540 guest requests at 12/s all answered, both sides connected (2.0.1: locked from request #511).
