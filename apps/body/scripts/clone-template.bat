@echo off
setlocal EnableDelayedExpansion
:: clone-template.bat — 将当前工程复制为新应用
::
:: 用法:
::   scripts\clone-template.bat --name <工程名> --dest <目标目录> [选项]
::
:: 必填:
::   --name  <name>   新工程名称（写入 package.json name 字段）
::   --dest  <path>   复制到的目标父目录
::
:: 可选:
::   --desc  <text>   新工程描述（写入 package.json description 字段）
::   --port  <num>    本地服务器端口（写入 app.config.ts）
::   --mkdir          开启后在 dest 下新建与 name 同名的子目录，再复制进去
::
:: 示例:
::   scripts\clone-template.bat --name my-app --dest D:\projects --port 6001 --mkdir
::   scripts\clone-template.bat --name my-app --dest D:\projects\my-app --desc "我的新应用"

:: ── 参数解析 ──────────────────────────────────────────────────────────────────
set "APP_NAME="
set "DEST_DIR="
set "APP_DESC="
set "APP_PORT="
set "USE_MKDIR=false"

:parse_args
if "%~1"=="" goto check_required
if /i "%~1"=="--name"  ( set "APP_NAME=%~2"  & shift & shift & goto parse_args )
if /i "%~1"=="--dest"  ( set "DEST_DIR=%~2"  & shift & shift & goto parse_args )
if /i "%~1"=="--desc"  ( set "APP_DESC=%~2"  & shift & shift & goto parse_args )
if /i "%~1"=="--port"  ( set "APP_PORT=%~2"  & shift & shift & goto parse_args )
if /i "%~1"=="--mkdir" ( set "USE_MKDIR=true" & shift & goto parse_args )
echo 未知参数: %~1
echo 用法: %~nx0 --name ^<name^> --dest ^<path^> [--desc ^<text^>] [--port ^<num^>] [--mkdir]
exit /b 1

:: ── 必填校验 ──────────────────────────────────────────────────────────────────
:check_required
if "%APP_NAME%"=="" ( echo 错误: --name 为必填项 & exit /b 1 )
if "%DEST_DIR%"=="" ( echo 错误: --dest 为必填项 & exit /b 1 )

:: ── 确定最终目标路径 ──────────────────────────────────────────────────────────
if "%USE_MKDIR%"=="true" (
  set "TARGET_DIR=%DEST_DIR%\%APP_NAME%"
) else (
  set "TARGET_DIR=%DEST_DIR%"
)

if exist "%TARGET_DIR%" (
  echo 错误: 目标路径已存在: %TARGET_DIR%
  exit /b 1
)

:: ── 确定源目录（脚本所在目录的上一级，即工程根目录） ──────────────────────────
set "SCRIPT_DIR=%~dp0"
:: 去掉末尾反斜杠
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
for %%I in ("%SCRIPT_DIR%\..") do set "SOURCE_DIR=%%~fI"

echo ────────────────────────────────────────
echo   源目录:   %SOURCE_DIR%
echo   目标目录: %TARGET_DIR%
echo   工程名:   %APP_NAME%
if not "%APP_DESC%"=="" echo   描述:     %APP_DESC%
if not "%APP_PORT%"=="" echo   端口:     %APP_PORT%
echo ────────────────────────────────────────

:: ── 复制文件（排除无需复制的目录）────────────────────────────────────────────
mkdir "%TARGET_DIR%"

:: 使用 robocopy 排除指定目录（/E 递归，/XD 排除目录）
robocopy "%SOURCE_DIR%" "%TARGET_DIR%" /E /XD ^
  "%SOURCE_DIR%\node_modules" ^
  "%SOURCE_DIR%\.git" ^
  "%SOURCE_DIR%\out" ^
  "%SOURCE_DIR%\dist" ^
  "%SOURCE_DIR%\build" ^
  "%SOURCE_DIR%\release" ^
  /NP /NFL /NDL /NJH /NJS > nul

echo ✔ 文件复制完成

:: ── 修改 package.json ─────────────────────────────────────────────────────────
set "PKG=%TARGET_DIR%\package.json"

:: 用 PowerShell 做 JSON 字段替换（避免 sed 依赖）
powershell -NoProfile -Command ^
  "$content = Get-Content '%PKG%' -Raw -Encoding UTF8;" ^
  "$content = $content -replace '\"name\": \"[^\"]*\"', '\"name\": \"%APP_NAME%\"';" ^
  "Set-Content '%PKG%' -Value $content -Encoding UTF8 -NoNewline"

if not "%APP_DESC%"=="" (
  powershell -NoProfile -Command ^
    "$content = Get-Content '%PKG%' -Raw -Encoding UTF8;" ^
    "$content = $content -replace '\"description\": \"[^\"]*\"', '\"description\": \"%APP_DESC%\"';" ^
    "Set-Content '%PKG%' -Value $content -Encoding UTF8 -NoNewline"
)

echo ✔ package.json 已更新

:: ── 修改 app.config.ts ────────────────────────────────────────────────────────
if not "%APP_PORT%"=="" (
  set "CFG=%TARGET_DIR%\app.config.ts"
  powershell -NoProfile -Command ^
    "$content = Get-Content '!CFG!' -Raw -Encoding UTF8;" ^
    "$content = $content -replace 'port: \d+', 'port: %APP_PORT%';" ^
    "Set-Content '!CFG!' -Value $content -Encoding UTF8 -NoNewline"
  echo ✔ app.config.ts 端口已更新为 %APP_PORT%
)

:: ── 初始化新 Git 仓库 ─────────────────────────────────────────────────────────
git -C "%TARGET_DIR%" init -q
echo ✔ Git 仓库已初始化

echo ────────────────────────────────────────
echo   完成！新工程位于: %TARGET_DIR%
echo   下一步: cd "%TARGET_DIR%" ^&^& npm install
echo ────────────────────────────────────────

endlocal
