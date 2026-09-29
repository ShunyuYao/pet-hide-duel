# 2.0.2 · 联机不再卡死

修复两处会让联机卡死、只能退出重开的问题。

- 客人连续快速操作（例如一直按转身）累计到 512 次后，房主会拒绝新的操作并报错，而且这次报错会让收消息的循环反复处理同一批消息：双方一直停在「正在重连」，对局暂停。现在房主只保留最近 512 条回复记录，不再拒绝新操作。
- 任何一条消息处理出错时，只报告并跳过这一条，后面的消息照常处理，不会再卡住整个联机。

- `pet-hide-duel.html`：在兼容桌宠中发送并一起玩。
- `pet-hide-duel-lan.zip`：解压后运行局域网启动器，普通浏览器可上传 2D 图片对战；房主需 Node.js 22+。
- `SHA256SUMS.txt`：下载文件校验值。

核心/网络/服务/宿主 SDK 测试全部通过，新增两项：一条消息出错不会卡住收消息、同一局超过 512 次操作不会卡住裁判。两台真实宿主的完整对局、再来一局、网络中断后恢复和退出验证通过。用接入真实宿主会话代码的模拟环境复查：客人以每秒 12 次连发 540 次操作，每次都有回复，双方保持连接。两端需使用同一版本。

已知边界与 2.0.1 相同：洞口看到的对方碎片随快照刷新，可能跳动；两台物理电脑、Windows 原生启动和公网联机未验证。

## English

Fixes two ways the LAN session could lock up until both players quit.

- After 512 guest actions in one session (for example holding the turn key), the host refused new actions with an error, and that error made the receive loop replay the same events forever: both sides stuck on "reconnecting", the match paused. The host now keeps only the last 512 replies and never refuses a new action.
- An event that fails to process is reported and skipped; later events are still handled.

All core/network/service/host-SDK tests pass, including two new ones for these cases, and the two-host game E2E (full match, rematch, network loss and resume, exit) passes. Against the real host session code, 540 guest actions at 12/s all got replies with both sides connected. Both peers must use this version. Known limitations are unchanged from 2.0.1.
