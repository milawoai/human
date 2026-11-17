# 2026-11-17 master 代码保存点

用户要求保存三方 Git 到 master。本记录首先保存已确认的 human 主仓库当前改动，不构成三方全部保存完成或新增业务验收。

## 保存范围

- 工具决策路由宿主实现、router@1.0 契约、冒烟验证脚本及实施/交接记录。
- human-3ih 成功业务载荷错误误判修复，与此前独立复核结果对应。
- 当前模型配置界面设计文件 designs/model-config-ui.pen。
- 先前已提交的四个调试入口与开发期启动门槛。
- Beads 跟踪记录和已有版本管理范围内的状态快照。

## 本次验证

- yarn workspace backend typecheck：通过。
- yarn workspace backend verify:tool-router：ALL 8 GATES PASS；真实模型冷启动 3043ms，六候选热推理 323ms，三候选热推理 178ms。
- 未重新执行真人录音、GUI 全冷启动、完整外部插件套件或所有存量回归。本保存点不扩张既有验收范围。

## 跨仓库完整性边界

apps/body 当前为 gitlink（e169dfb8c73424e94eb829a41fd82de8d93f4345），本地缺少 .git 与 .gitmodules 映射，父仓库提交不会包含其工作目录源码。此前部分修改以 patches/ 补丁保存。human-tools 和 Obsidian 目录未找到独立 Git 元数据，未创建仓库或猜测远端。另两方仓库身份待用户确认后继续保存；本记录不能视为外部插件或 Obsidian 当前内容的完整 Git 备份。
