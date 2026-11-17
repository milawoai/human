#!/usr/bin/env bash
# clone-template.sh — 将当前工程复制为新应用
#
# 用法:
#   ./scripts/clone-template.sh --name <工程名> --dest <目标目录> [选项]
#
# 必填:
#   --name  <name>   新工程名称（写入 package.json name 字段）
#   --dest  <path>   复制到的目标父目录
#
# 可选:
#   --desc  <text>   新工程描述（写入 package.json description 字段）
#   --port  <num>    本地服务器端口（写入 app.config.ts）
#   --mkdir          开启后在 dest 下新建与 name 同名的子目录，再复制进去
#
# 示例:
#   ./scripts/clone-template.sh --name my-app --dest ~/projects --port 6001 --mkdir
#   ./scripts/clone-template.sh --name my-app --dest ~/projects/my-app --desc "我的新应用"

set -euo pipefail

# ── 参数解析 ──────────────────────────────────────────────────────────────────
APP_NAME=""
DEST_DIR=""
APP_DESC=""
APP_PORT=""
USE_MKDIR=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)  APP_NAME="$2";  shift 2 ;;
    --dest)  DEST_DIR="$2";  shift 2 ;;
    --desc)  APP_DESC="$2";  shift 2 ;;
    --port)  APP_PORT="$2";  shift 2 ;;
    --mkdir) USE_MKDIR=true; shift   ;;
    *)
      echo "未知参数: $1"
      echo "用法: $0 --name <name> --dest <path> [--desc <text>] [--port <num>] [--mkdir]"
      exit 1
      ;;
  esac
done

# ── 必填校验 ──────────────────────────────────────────────────────────────────
if [[ -z "$APP_NAME" ]]; then
  echo "错误: --name 为必填项"
  exit 1
fi
if [[ -z "$DEST_DIR" ]]; then
  echo "错误: --dest 为必填项"
  exit 1
fi

# ── 确定最终目标路径 ──────────────────────────────────────────────────────────
DEST_DIR="${DEST_DIR/#\~/$HOME}"   # 展开 ~

if [[ "$USE_MKDIR" == true ]]; then
  TARGET_DIR="$DEST_DIR/$APP_NAME"
else
  TARGET_DIR="$DEST_DIR"
fi

if [[ -e "$TARGET_DIR" ]]; then
  echo "错误: 目标路径已存在: $TARGET_DIR"
  exit 1
fi

# ── 确定源目录（脚本所在目录的上一级，即工程根目录） ──────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"

echo "────────────────────────────────────────"
echo "  源目录:   $SOURCE_DIR"
echo "  目标目录: $TARGET_DIR"
echo "  工程名:   $APP_NAME"
[[ -n "$APP_DESC" ]] && echo "  描述:     $APP_DESC"
[[ -n "$APP_PORT" ]] && echo "  端口:     $APP_PORT"
echo "────────────────────────────────────────"

# ── 复制文件（排除无需复制的目录）────────────────────────────────────────────
mkdir -p "$TARGET_DIR"

rsync -a \
  --exclude="node_modules/" \
  --exclude=".git/" \
  --exclude="out/" \
  --exclude="dist/" \
  --exclude="build/" \
  --exclude="release/" \
  "$SOURCE_DIR/" "$TARGET_DIR/"

echo "✔ 文件复制完成"

# ── 修改 package.json ─────────────────────────────────────────────────────────
PKG="$TARGET_DIR/package.json"

# 替换 name
sed -i.bak "s|\"name\": \"[^\"]*\"|\"name\": \"$APP_NAME\"|" "$PKG"

# 替换 description（如果提供）
if [[ -n "$APP_DESC" ]]; then
  sed -i.bak "s|\"description\": \"[^\"]*\"|\"description\": \"$APP_DESC\"|" "$PKG"
fi

rm -f "$PKG.bak"
echo "✔ package.json 已更新"

# ── 修改 app.config.ts ────────────────────────────────────────────────────────
# 匹配 server 块内的 port 字段，用结构而非数值定位，无论当前端口是什么都能正确替换
if [[ -n "$APP_PORT" ]]; then
  CFG="$TARGET_DIR/app.config.ts"
  # 用两行上下文锁定 server: { ... port: N } 中的 port 行，避免误匹配其他 port 字段
  awk -v port="$APP_PORT" '
    /server[[:space:]]*:/ { in_server=1 }
    in_server && /port[[:space:]]*:/ {
      sub(/port[[:space:]]*:[[:space:]]*[0-9]+/, "port: " port)
      in_server=0
    }
    { print }
  ' "$CFG" > "$CFG.tmp" && mv "$CFG.tmp" "$CFG"
  echo "✔ app.config.ts 端口已更新为 $APP_PORT"
fi

# ── 初始化新 Git 仓库 ─────────────────────────────────────────────────────────
git -C "$TARGET_DIR" init -q
echo "✔ Git 仓库已初始化"

echo "────────────────────────────────────────"
echo "  完成！新工程位于: $TARGET_DIR"
echo "  下一步: cd \"$TARGET_DIR\" && npm install"
echo "────────────────────────────────────────"
