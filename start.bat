@echo off
chcp 65001 > nul
title 金铲铲水友赛后端服务

echo ================================
echo  金铲铲水友赛 - 后端服务
echo ================================
echo.

REM ===== 安全校验：防止从错误路径启动 =====
SET "CURRENT_DIR=%~dp0"
SET "CURRENT_DIR=%CURRENT_DIR:~0,-1%"
echo [安全检查] 当前路径: %CURRENT_DIR%
echo %CURRENT_DIR% | findstr /i "C:\\Users\\echojjjli\\WorkBuddy" >nul 2>&1
if %errorlevel%==0 (
    echo.
    echo ❌ 错误：检测到正在从C盘旧路径启动！
    echo    当前路径: %CURRENT_DIR%
    echo    正确路径: D:\金铲铲水友赛网页\tft-tournament\
    echo.
    echo 请使用D盘的正确路径启动，3秒后自动退出...
    timeout /t 3 > nul
    exit /b 1
)
echo ✅ 路径校验通过
echo.

REM 切换到后端目录
cd /d "D:\金铲铲水友赛网页\tft-tournament\backend"

REM 杀掉占用3001端口的旧进程
echo [1/3] 检查端口占用...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
    echo   杀掉旧进程 PID: %%a
    taskkill /f /pid %%a > nul 2>&1
)
timeout /t 1 > nul

REM 启动后端服务（后台运行）
echo [2/3] 启动后端服务...
start "" /b node server.js

REM 等待服务启动
echo [3/3] 等待服务就绪...
timeout /t 3 > nul

REM 验证服务（用PowerShell代替curl）
powershell -Command "try { $r=Invoke-WebRequest -Uri 'http://localhost:3001/api/config' -TimeoutSec 3; Write-Host '✅ 后端服务启动成功！' -ForegroundColor Green; Write-Host '  地址: http://localhost:3001' -ForegroundColor Cyan } catch { Write-Host '❌ 服务启动失败，请检查 node 是否安装' -ForegroundColor Red; pause }"

echo.
echo ================================
echo  服务已在后台运行，可关闭此窗口
echo ================================
timeout /t 5 > nul
