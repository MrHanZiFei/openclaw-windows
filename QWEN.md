# OpenClaw 项目指南

## 项目概述

**OpenClaw** 是一个个人 AI 助手，可在您自己的设备上运行。它支持多种消息渠道（WhatsApp、Telegram、Slack、Discord、Signal、iMessage 等），并能通过语音交互和 Canvas 界面与用户沟通。

- **仓库**: https://github.com/openclaw/openclaw
- **官网**: https://openclaw.ai
- **文档**: https://docs.openclaw.ai
- **愿景**: [`VISION.md`](VISION.md)

### 核心架构

```
消息渠道 (WhatsApp/Telegram/Slack/Discord/...)
               │
               ▼
┌───────────────────────────────┐
│            Gateway            │
│       (WebSocket 控制平面)      │
│     ws://127.0.0.1:18789      │
└──────────────┬────────────────┘
               │
               ├─ Pi agent (RPC)
               ├─ CLI (openclaw …)
               ├─ WebChat UI
               ├─ macOS app
               └─ iOS / Android nodes
```

### 技术栈

- **语言**: TypeScript (ESM)
- **运行时**: Node.js ≥22
- **包管理器**: pnpm@10.23.0
- **构建工具**: tsdown
- **测试框架**: Vitest
- **代码检查**: Oxlint + Oxfmt
- **移动应用**: Swift (iOS), Kotlin (Android)

## 项目结构

```
openclaw/
├── src/                    # 核心源代码
│   ├── cli/               # CLI 命令实现
│   ├── commands/          # 命令处理逻辑
│   ├── gateway/           # Gateway WebSocket 服务器
│   ├── agents/            # Agent 运行时
│   ├── channels/          # 渠道集成
│   ├── providers/         # 模型提供商
│   ├── plugins/           # 插件系统
│   └── ...
├── apps/                   # 移动/桌面应用
│   ├── macos/             # macOS 菜单栏应用
│   ├── ios/               # iOS 节点应用
│   ├── android/           # Android 节点应用
│   └── shared/            # 共享代码
├── extensions/             # 扩展插件（工作区包）
│   ├── bluebubbles/       # iMessage (BlueBubbles)
│   ├── msteams/           # Microsoft Teams
│   ├── matrix/            # Matrix
│   ├── zalo/              # Zalo
│   └── ...
├── ui/                     # Web UI (Control UI + WebChat)
├── docs/                   # 文档 (Mintlify)
├── scripts/                # 构建和工具脚本
├── test/                   # 测试辅助文件
└── skills/                 # 打包的技能
```

## 构建和运行

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
# 运行 CLI（开发模式，支持热重载）
pnpm openclaw <command>

# Gateway 开发模式（跳过渠道连接）
pnpm gateway:dev

# Gateway 监听模式（自动重载）
pnpm gateway:watch

# UI 开发服务器
pnpm ui:dev
```

### 构建

```bash
# 完整构建
pnpm build

# 仅检查 TypeScript
pnpm tsgo
```

### 测试

```bash
# 运行所有测试
pnpm test

# 单元测试（快速）
pnpm test:fast

# 覆盖率报告
pnpm test:coverage

# E2E 测试
pnpm test:e2e

# 实时测试（需要真实 API 密钥）
CLAWDBOT_LIVE_TEST=1 pnpm test:live
```

### 代码质量

```bash
# 完整检查（格式 + lint + TypeScript）
pnpm check

# 仅格式化检查
pnpm format:check

# 自动修复格式问题
pnpm format:fix

# Lint 检查
pnpm lint

# 自动修复 lint 问题
pnpm lint:fix
```

## 开发约定

### 代码风格

- 使用 TypeScript 严格模式，避免 `any`
- 文件保持在 ~500-700 行以内，超过时考虑拆分
- 使用 Oxlint 和 Oxfmt 进行格式化和 lint
- 禁止使用 `@ts-nocheck`，不要禁用 `no-explicit-any`
- 避免通过原型混入共享类行为，使用显式继承/组合

### 命名约定

- 产品/文档中使用 **OpenClaw**
- CLI 命令、包名、路径使用 `openclaw`

### 测试约定

- 测试文件与源文件同目录，命名为 `*.test.ts`
- E2E 测试命名为 `*.e2e.test.ts`
- 覆盖率阈值：70% (lines/functions/statements), 55% (branches)
- 测试 worker 数量不超过 16

### 提交约定

- 使用 `scripts/committer "<msg>" <file...>` 创建提交
- 提交消息简洁、面向动作（如 `CLI: add verbose flag to send`）
- 一个 PR 只解决一个问题，不要捆绑不相关的修改
- PR 超过 ~5000 行改动仅在特殊情况下审查

## 关键命令速查

| 命令 | 说明 |
|------|------|
| `pnpm openclaw onboard` | 启动引导向导 |
| `pnpm openclaw gateway` | 启动 Gateway |
| `pnpm openclaw agent --message "..."` | 与助手对话 |
| `pnpm openclaw doctor` | 诊断问题 |
| `pnpm openclaw channels status` | 查看渠道状态 |

## 渠道和扩展

### 核心渠道（src/）

- WhatsApp, Telegram, Discord, Slack, Signal, iMessage (legacy), Web

### 扩展渠道（extensions/）

- BlueBubbles (iMessage), Microsoft Teams, Matrix, Feishu, LINE, Mattermost, Nextcloud Talk, Nostr, Synology Chat, Tlon, Twitch, Zalo

### 添加新渠道

1. 考虑所有内置 + 扩展渠道
2. 更新 `.github/labeler.yml` 和 GitHub labels
3. 更新相关文档

## 文档链接

- 内部文档链接使用根相对路径：`[Config](/configuration)`
- README 中使用完整 URL：`https://docs.openclaw.ai/...`
- 文档标题避免使用破折号和撇号（会破坏 Mintlify 锚点链接）

## 安全注意事项

- 默认情况下，未知发送者需要配对码验证
- DM 配对策略：`dmPolicy="pairing"`（默认）
- 公开 DM 需要 `dmPolicy="open"` 和 allowlist 配置
- 详见 [`SECURITY.md`](SECURITY.md)

## 多代理协作

- 不要创建/修改 `git stash` 除非明确要求
- 不要切换分支或修改 `.worktrees/`
- 提交时只包含自己的修改
- 推送前先 `git pull --rebase`

## 常见问题排查

- 配置存储：`~/.openclaw/`
- 凭证存储：`~/.openclaw/credentials/`
- 会话日志：`~/.openclaw/sessions/`
- 使用 `openclaw doctor` 诊断迁移/配置问题