# 轻刻 · 网页版 LightMark Web

轻刻 Android App（v2.0.0 起）是**完全离线**应用：不声明网络权限、无账号体系。所有**在线能力**集中在本网页版，二者通过 `lightmark-data.json` 数据契约互通。

网页版功能：
- 📋 本地待办管理（增删改、优先级、状态、分类、标签、截止/开始日期、重复、置顶、归档）
- ☁️ GitHub 仓库同步（多设备 / 与 App 互通）
- 🤖 AI 助手（OpenAI 兼容接口 + 本机规则兜底；生成待办 / 润色 / 总结 / 聊天）
- 💾 JSON 导入导出（与 App 的「备份导出」格式完全一致）

纯静态站点，**无后端、无构建步骤、无需备案**。

---

## 托管方式

### 方式一：GitHub Pages（推荐）
1. 把本目录（`index.html` / `styles.css` / `app.js` / `README.md` / `lightmark-data.json`）推到一个仓库。
2. 仓库 Settings → Pages → Source 选 `main` 分支根目录。
3. 访问 `https://<你的ID>.github.io/<仓库名>/`。

### 方式二：任意静态托管 / 直接打开
- 放到任意静态服务器，或本地 `python -m http.server` 后访问。
- 也可直接双击 `index.html` 打开（GitHub/AI 的联网功能在 `file://` 下仍可用，因走的是 api.github.com 的 CORS）。

---

## 数据契约（与 App 完全一致）

顶层结构 `SyncData`：

```json
{
  "version": 1,
  "lastSync": 1690000000000,
  "todos": [ /* TodoItem[] */ ],
  "categories": [ /* Category[] */ ]
}
```

`TodoItem`：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | 唯一标识 |
| title | string | 标题 |
| description | string | 描述 |
| isCompleted | boolean | 是否完成 |
| priority | enum | `IDLE`/`LOW`/`MEDIUM`/`HIGH`/`URGENT` |
| categoryId | string? | 分类 ID |
| tags | string[] | 标签 |
| dueDate | number? | 截止时间戳(ms) |
| startDate | number? | 开始时间戳(ms) |
| isPinned | boolean | 置顶 |
| isBlocked | boolean | 被阻塞 |
| status | enum | `ACTIVE`/`PAUSED`/`CANCELLED` |
| isArchived | boolean | 归档 |
| isDeleted | boolean | 软删除（回收站） |
| deletedAt | number? | 删除时间 |
| parentId | string? | 父任务 |
| recurrenceRule | string? | `NONE`/`DAILY`/`WEEKLY`/`MONTHLY`/`INTERVAL:n` |
| createdAt / updatedAt / completedAt | number | 时间戳(ms) |

`Category`：`id`(string)、`name`(string)、`color`(number，如 `0xff6200ee`)、`icon`(string)、`createdAt`(number)。

> App 导出的备份文件可直接在本页「同步 → 导入 JSON」载入，反之亦然。

---

## 使用提示

### GitHub 同步
- 生成一个 **Personal Access Token**（GitHub → Settings → Developer settings → PAT），勾选 `repo`（私有库）或 `public_repo`（公开库）。
- 在「同步」页填写 owner / repo（默认 `lightmark-data`）/ branch（默认 `main`）/ Token，点「保存配置」。
- 「推送」把本地数据写入仓库的 `lightmark-data.json`；「拉取」读回并合并（按 `updatedAt` 取较新者）。
- Token 仅存于本机 `localStorage`，只发往 `api.github.com`。

### AI 助手
- 填 OpenAI 兼容的 Base URL + Key + 模型（如 `https://api.openai.com/v1` / `gpt-3.5-turbo`）。
- 不填则走**本机规则**兜底：生成待办（按行拆分）、润色、总结、基础聊天，完全离线。
- 密钥仅存本机，只发往你填写的地址。
