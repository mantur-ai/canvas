# Mantur Canvas

[English](./README.md)

官网：[https://mantur.cn](https://mantur.cn)

Mantur Canvas 是面向剧本分镜、素材管理和 AI 生成工作流的本地创作画布。它帮助创作者把剧本整理为结构化项目、剧集、分镜条目、可复用素材、生成图片、生成视频，以及可进入剪辑流程的媒体内容。

## 产品定位

Mantur Canvas 面向本地优先的创作生产流程：

- 管理基于剧本的创作项目
- 组织剧集、分镜、素材、图片和视频
- 使用 React Flow 可视化画布规划并执行生成工作流
- 配置本地 Agent、图片模型和视频模型服务
- 将项目生成数据保存在自己的机器上
- 支持本地开发模式和 Next.js 生产模式运行

## 产品模块

- **项目**：创建、切换和管理本地创作项目。
- **剧集**：管理故事段落及其分镜素材。
- **画布**：编排工作流节点，并按项目持久化画布状态。
- **素材**：管理角色、场景、道具、声音、视频和参考图。
- **AI Chat / Agents**：基于当前项目上下文运行已配置的 Agent。
- **设置**：配置图片模型、视频模型、图床服务和 Agent。
- **视频底栏**：预览和组合生成的视频片段。

## 技术栈

- Next.js App Router
- React 19
- React Flow
- Tailwind CSS
- ShadCN/UI
- next-intl
- Zustand

## 环境要求

- Node.js 20 或更高版本
- npm
- 本地视频合并使用随依赖安装的 `ffmpeg-static` 和 `ffprobe-static`

## 安装

克隆仓库并安装依赖：

```bash
git clone https://github.com/mantur-ai/canvas.git
cd canvas
npm install
```

将 `example` 中的示例数据库配置和技能复制到项目根目录：

```bash
mkdir -p db skills
cp -R example/db/. db/
cp -R example/skills/. skills/
```

## 小白一键启动

直接使用系统启动脚本。即使本机还没有 Node.js，脚本也会先安装 Node.js。

Windows：

```bat
scripts\quick-start.cmd
```

macOS 或 Linux：

```bash
bash scripts/quick-start.sh
```

一键启动脚本会检查 Node.js 版本、安装依赖、补齐本地示例文件，并启动开发服务。

## 开发模式启动

```bash
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。

## 生产构建

```bash
npm run build
npm run start
```

## 使用 PM2 运行

在服务器上先安装一次 PM2：

```bash
npm install -g pm2
```

使用 PM2 启动前先构建应用：

```bash
npm install
npm run build
npm run pm2:start
```

PM2 配置位于 `ecosystem.config.cjs`，生产应用默认监听 `0.0.0.0:3000`。

常用 PM2 命令：

```bash
npm run pm2:reload
npm run pm2:stop
pm2 logs mantur-canvas
pm2 save
```

## 首次使用

打开应用后：

1. 创建或选择一个项目。
2. 进入设置，补充必要的模型与服务配置。
3. 如果需要使用 Agent 工作流，配置 Agent 启动命令。
4. 添加或导入剧本与项目素材。
5. 使用画布、素材面板和剧集面板管理生成流程。

配置和生成数据默认保存在本地。除非你通过已配置的服务主动上传或分享，否则不会离开本机工作区。

## 本地数据

运行时数据默认保存在本地：

- `projects/`：生成的项目、画布数据、素材、图片、视频和 manifest
- `db/config.json`：本地模型与服务配置
- `db/agent.json`：本地 Agent 配置

这些路径可能包含用户私有数据、API 配置、提示词、生成媒体和服务返回结果。发布、备份或分享工作区前请先检查。

## 常用脚本

- `npm run dev`：启动开发服务器
- `npm run quick-start`：在已安装 Node.js 时检查环境、安装依赖并启动开发服务器
- `npm run build`：构建生产版本
- `npm run start`：启动生产服务器
- `npm run pm2:start`：使用 PM2 启动生产服务器
- `npm run pm2:reload`：新构建或环境变量变更后重载 PM2 进程
- `npm run pm2:stop`：停止 PM2 进程
- `npm run lint`：运行 Oxlint
- `npm run format`：使用 Oxfmt 格式化文件
- `npm run format:check`：检查格式

## 开发说明

- UI 文案应放入 `messages/` 下的语言包。
- 项目文件读写应通过 service 模块完成。
- 画布数据应保持可序列化。
- 不要提交生成的项目数据或私有配置。

## 参与贡献

欢迎提交 Issue 和 Pull Request。请说明你修改的产品行为，保持文档同步，并在提交 PR 前运行 lint/build 检查。

## 开源协议

本项目基于 [MIT License](./LICENSE) 开源。
