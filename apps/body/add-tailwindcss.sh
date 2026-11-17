#!/bin/bash

# 设置颜色
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # 无颜色

# 检查是否为Vite项目
if [ ! -f "vite.config.js" ] && [ ! -f "vite.config.ts" ]; then
  echo -e "${RED}错误: 当前目录不是Vite项目，未找到vite.config.js或vite.config.ts文件${NC}"
  exit 1
fi

# 打印欢迎信息
echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}      Tailwind CSS 安装助手     ${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""

# 检测包管理器
if [ -f "yarn.lock" ]; then
  PACKAGE_MANAGER="yarn"
  ADD_COMMAND="add -D"
elif [ -f "pnpm-lock.yaml" ]; then
  PACKAGE_MANAGER="pnpm"
  ADD_COMMAND="add -D"
else
  PACKAGE_MANAGER="npm"
  ADD_COMMAND="install --save-dev"
fi

echo -e "${GREEN}检测到包管理器: ${PACKAGE_MANAGER}${NC}"
echo ""

# 安装依赖
echo -e "${BLUE}安装 Tailwind CSS 相关依赖...${NC}"
$PACKAGE_MANAGER $ADD_COMMAND tailwindcss postcss autoprefixer

# 创建 Tailwind 配置文件
echo -e "${BLUE}创建 Tailwind CSS 配置文件...${NC}"
npx tailwindcss init -p

# 更新 tailwind.config.js
echo -e "${BLUE}更新 Tailwind CSS 配置...${NC}"
cat > tailwind.config.js << EOF
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
EOF

# 检测是否为 Vue 项目
IS_VUE=false
if grep -q "vue" package.json; then
  IS_VUE=true
fi

# 创建 CSS 文件
echo -e "${BLUE}创建 Tailwind CSS 入口文件...${NC}"

# 检查目录结构
if [ -d "src/assets" ]; then
  CSS_DIR="src/assets"
elif [ -d "src/styles" ]; then
  CSS_DIR="src/styles"
else
  mkdir -p src/assets
  CSS_DIR="src/assets"
fi

# 创建或更新 CSS 文件
CSS_FILE="$CSS_DIR/tailwind.css"
echo '@tailwind base;' > $CSS_FILE
echo '@tailwind components;' >> $CSS_FILE
echo '@tailwind utilities;' >> $CSS_FILE

echo -e "${GREEN}CSS 文件已创建在 $CSS_FILE${NC}"

# 修改 main 文件以导入 Tailwind CSS
if [ "$IS_VUE" = true ]; then
  if [ -f "src/main.js" ]; then
    MAIN_FILE="src/main.js"
  elif [ -f "src/main.ts" ]; then
    MAIN_FILE="src/main.ts"
  fi

  if [ -n "$MAIN_FILE" ]; then
    echo -e "${BLUE}更新 $MAIN_FILE 以导入 Tailwind CSS...${NC}"
    IMPORT_LINE="import './$CSS_DIR/tailwind.css'"
    
    # 相对路径转换
    IMPORT_LINE=$(echo $IMPORT_LINE | sed "s|src/||g")
    
    # 检查是否已存在
    if ! grep -q "tailwind.css" $MAIN_FILE; then
      # 在文件顶部添加导入语句
      sed -i.bak "1s/^/$IMPORT_LINE\n/" $MAIN_FILE
      rm -f "$MAIN_FILE.bak"
      echo -e "${GREEN}已更新 $MAIN_FILE${NC}"
    else
      echo -e "${BLUE}$MAIN_FILE 已包含 Tailwind CSS 导入${NC}"
    fi
  fi
else
  echo -e "${BLUE}非 Vue 项目，请手动导入 Tailwind CSS 文件${NC}"
  echo -e "${BLUE}在 main.js/ts 文件中添加: import './$CSS_DIR/tailwind.css'${NC}"
fi

# 创建示例组件（仅限Vue项目）
if [ "$IS_VUE" = true ]; then
  echo -e "${BLUE}创建 Tailwind CSS 示例组件...${NC}"
  COMPONENT_DIR="src/components"
  
  if [ ! -d "$COMPONENT_DIR" ]; then
    mkdir -p $COMPONENT_DIR
  fi
  
  EXAMPLE_COMPONENT="$COMPONENT_DIR/TailwindExample.vue"
  cat > $EXAMPLE_COMPONENT << EOF
<template>
  <div class="p-6 max-w-sm mx-auto bg-white rounded-xl shadow-md flex items-center space-x-4">
    <div class="shrink-0">
      <div class="h-12 w-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">TW</div>
    </div>
    <div>
      <div class="text-xl font-medium text-black">Tailwind CSS 已成功安装</div>
      <p class="text-gray-500">开始使用吧！</p>
    </div>
  </div>
</template>
EOF
  
  echo -e "${GREEN}示例组件已创建在 $EXAMPLE_COMPONENT${NC}"
fi

echo ""
echo -e "${GREEN}====================================${NC}"
echo -e "${GREEN}  Tailwind CSS 已成功安装！   ${NC}"
echo -e "${GREEN}====================================${NC}"
echo ""
echo -e "${BLUE}使用提示:${NC}"
echo -e "1. 您可以在组件中使用 Tailwind 的工具类，如 ${GREEN}class=\"text-blue-500 font-bold p-4\"${NC}"
echo -e "2. 配置文件位于 ${GREEN}tailwind.config.js${NC}，您可以在此定制主题"
echo -e "3. 查看 Tailwind CSS 文档获取更多信息: ${GREEN}https://tailwindcss.com/docs${NC}"

if [ "$IS_VUE" = true ]; then
  echo -e "4. 查看示例组件: ${GREEN}$EXAMPLE_COMPONENT${NC}"
fi

exit 0 