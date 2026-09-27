@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo 房主电脑需要安装 Node.js 22 或更新版本。自动带入形象需要两端使用支持本功能的桌宠。
  pause
  exit /b 1
)
node launch-server.cjs %*
if errorlevel 1 pause
