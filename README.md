# 数据一致性自动化核对工具

## 项目介绍

基于 **Electron** 的跨平台桌面应用，用于在配置好 API 与数据库后，对业务数据进行一致性核对。核对逻辑运行在 **Electron 主进程（Node.js）** 中，通过 **预加载脚本** 与渲染进程安全通信，无需单独启动 Python 服务。

## 功能特性

- 系统设置与多环境 API 配置
- 数据库连接配置（PostgreSQL）
- 表级检查规则配置与数据一致性检查
- 配置导入/导出（含预加载层提供的加解密能力）
- 登录与主题等界面能力（见 `src/App.jsx`、`src/components/LoginScreen.jsx`）

## 技术栈

| 层级 | 技术 |
|------|------|
| 界面 | React 19、Vite 8 |
| 桌面壳 | Electron 31 |
| 进程通信 | `preload.cjs`（`contextBridge` + `ipcRenderer.invoke`） |
| 核对执行 | Node.js 主进程内 `DataConsistencyChecker`（`backend/db_checker.js`） |
| 数据库访问 | `pg`（PostgreSQL） |

## 环境要求

- **Node.js**：建议 20 LTS 或更高（需与 Vite 8、Electron 31 兼容）
- **PostgreSQL**：与 `backend/config/config.json` 中配置一致，且网络可达
- **开发**：macOS / Linux 下 `npm run electron:dev` 可直接使用；若在 Windows `cmd` 下遇到环境变量写法问题，可在 Git Bash / WSL 中执行，或自行改为 `cross-env` 等形式

## 快速开始

### 1. 克隆并安装依赖

```bash
git clone https://github.com/Taylor-Ding/electron-app.git
cd electron-app
npm install
```

### 2. 配置数据库

编辑 `backend/config/config.json`，将 `databases` 下各实例的 `host`、`port`、`user`、`password` 改为你的实际环境。应用运行时主进程会从该路径读取配置：

- **开发**：项目根目录下的 `backend/config/config.json`
- **打包后**：`process.resourcesPath/backend/config/config.json`（与 `electron-builder` 的 `extraResources` 一致）

请勿将真实口令提交到公共仓库；本地可使用私有副本或环境管理方案。

### 3. 开发运行

推荐一条命令同时拉起 Vite 与 Electron（会先等待 `http://localhost:5173`）：

```bash
npm run electron:dev
```

也可分步：

```bash
npm run dev          # 仅前端开发服务器
# 另开终端，在 NODE_ENV=development 下启动 Electron，例如：
NODE_ENV=development npx electron .
```

开发模式下窗口会加载 `http://localhost:5173`，并自动打开开发者工具。

### 4. 其他脚本

| 命令 | 说明 |
|------|------|
| `npm run build` | 构建前端到 `dist/` |
| `npm run preview` | 本地预览构建后的前端 |
| `npm run lint` | ESLint 检查 |
| `npm run electron:build` | `vite build` 后执行 `electron-builder`，产物默认在 `release/` |

## 架构说明（主进程 / 预加载 / 渲染进程）

- **`main.js`**：创建窗口；注册 IPC：`save-table-settings`、`run-node-check`、`save-file`；在 `run-node-check` 中实例化 `DataConsistencyChecker` 并执行核对。
- **`preload.cjs`**：向页面暴露 `window.electronAPI`（保存表配置、执行核对、保存文件、文本加解密等），避免渲染进程直接访问 Node。
- **`src/`**：React 界面；在 Electron 中通过 `window.electronAPI` 调用上述能力。

## 项目结构（概要）

```
electron-app/
├── src/                    # React 渲染进程源码
│   ├── App.jsx
│   ├── components/         # 如 LoginScreen.jsx
│   └── ...
├── backend/
│   ├── db_checker.js       # 数据一致性核对（主进程 import）
│   ├── config/
│   │   └── config.json     # 数据库等配置
│   └── ...                 # 其他 Node 侧工具模块（若有）
├── public/                 # 静态资源
├── main.js                 # Electron 主进程入口
├── preload.cjs             # 预加载脚本（CommonJS）
├── vite.config.js
├── package.json
├── dist/                   # 前端构建输出（构建后生成）
├── release/                # electron-builder 输出（打包后生成）
└── .github/workflows/      # CI（如自动构建）
```

## 构建发布

可使用 `npm run electron:build` 生成本地安装包。仓库中的 GitHub Actions（`.github/workflows`）也可用于多平台构建；具体目标平台以 workflow 与 `package.json` 的 `build` 字段为准。

`package.json` 中 `build.extraResources` 可能包含 `backend/**/*` 等资源拷贝规则；若你已完全移除 Python 虚拟环境依赖，可视情况精简 `extraResources`，避免安装包体积过大。

## 常见问题

- **执行核对失败**：确认 PostgreSQL 可连、`backend/config/config.json` 正确，且主进程能加载 `backend/db_checker.js`（与 `main.js` 中的 import 路径一致）。
- **仅浏览器打开 `npm run dev`**：核对功能依赖 Electron IPC；完整体验请使用 `npm run electron:dev`。
- **开发模式白屏**：确认 Vite 已监听 `5173` 后再启动 Electron，或直接采用 `npm run electron:dev`。

## 许可证与作者

详见 `package.json` 中的 `author` 与仓库说明。
