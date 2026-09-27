#!/bin/zsh
# Only starts this game's service; does not launch or alter the desktop pet.
cd -- "${0:A:h}" || exit 1
if command -v node >/dev/null 2>&1; then
  duel_node="$(command -v node)"
else
  for duel_candidate in /opt/homebrew/opt/node@22/bin/node /opt/homebrew/bin/node /usr/local/bin/node "$HOME"/.nvm/versions/node/v22.*/bin/node(N); do
    if [[ -x "$duel_candidate" ]]; then
      duel_node="$duel_candidate"
      break
    fi
  done
fi
if [[ -z "$duel_node" ]]; then
  print '房主电脑需要安装 Node.js 22 或更新版本。自动带入形象需要两端使用支持本功能的桌宠。'
  read '?按回车关闭…'
  exit 1
fi
"$duel_node" launch-server.cjs "$@"
duel_exit=$?
if (( duel_exit != 0 )); then
  read '?按回车关闭…'
fi
exit $duel_exit
