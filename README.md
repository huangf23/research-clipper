# research-clipper（单一文献内请勿只摘录图片）

一个轻量、面向科研摘录的 Chrome 扩展，用于从网页快速摘录文字或图片、自动尝试从页面提取文献元信息（DOI、标题、作者等）、使用 CrossRef 补全元数据、按关键词管理笔记、导入/导出 JSON 以便跨机器共享。

**主要特性**
- 右键摘录选中文本：右键选择文本 → “收录到文献库”，自动尝试获取页面元信息并保存摘录。
- 右键摘录图片：右键图片 → “收录图片到文献库”，会尝试把图片 fetch 为 base64（嵌入导出 JSON）并合并页面元信息。
- 简单的关键词（Tags）系统：添加/删除关键词，给每条笔记打标签，用关键词筛选显示。
- 导出/导入 JSON：支持导出包含 `notes` 与 `keywords` 的 JSON，支持导入并自动合并（去重、把 `meta.category` 映射为关键词）。
- 分组显示：按文献（DOI/URL/标题）分组并显示每组内摘录。
- 本地存储：使用 `chrome.storage.local` 保存数据，主要键名为 `notes_v2` 和 `keywords`。
- 搜索：侧边栏有内置搜索，支持按摘录文字、注释、meta（标题/作者/期刊/DOI/摘要/URL）和关键词搜索。

**安装（开发/本地调试）**
- 在 Chrome（或 Chromium）中打开 `chrome://extensions/`。
- 右上角开启 `开发者模式`。
- 点击 `加载已解压的扩展程序`（Load unpacked），选择项目文件夹（例如 `huangf23-web-clipper/`）。
- 加载后可以在扩展列表中找到并打开侧边栏或右键菜单测试功能。

**使用方法（快速）**
- 摘录文本：在任意页面选中文字，右键 → 选择 `收录到文献库`。侧边栏会显示新笔记（若页面可注入 content script，则会尝试提取 DOI/标题/作者等）。
- 摘录图片：右键图片 → 选择 `收录图片到文献库`。扩展会尝试 fetch 图片并保存为 base64（注意：大图片会占用较多存储空间）。
- 管理关键词：侧边栏顶部点击 `⚙️ 管理` 打开关键词管理模态，添加或删除关键词。单条笔记也可直接给其加/删关键词。
- 导出/导入：侧边栏顶部有 `导出 JSON` / `导出 BibTeX` / `导入 JSON` 按钮。导入会合并关键词并做简单去重。
- 搜索：在侧边栏顶部输入检索词，列表会实时过滤显示匹配项，点击 `清除` 恢复完整列表。

**数据结构（概览）**
- `notes_v2`（数组，每项示例）：
```
{
  id: "167xxxxxxx",
  text: "摘录的文字，图片笔记可能为空字符串",
  comment: "用户可以写的注释",
  meta: { title, author, journal, doi, url, imageData, imageUrl, ... },
  keywords: ["ml","nlp"],
  timestamp: 167xxxxxxx
}
```
- `keywords`（数组）：顶层关键词列表，用于 UI 选择与分组统计。

**常见问题与排查**
- 如果“收录到文献库”没有提取到元信息（`meta` 为空或缺少 DOI）:
  - 检查扩展是否已注入 `content.js`：打开目标页面，按 F12 → Console，查看是否有 `[Research Clipper] 提取的元数据:` 日志。
  - 检查 `chrome://extensions/` 中扩展是否具有必要权限与主机权限（如 manifest 中的 `host_permissions`）。
  - 某些页面（例如 `chrome://`、扩展内部页、或严格的 CSP 页面）不能注入 content script，会跳过自动提取。

- 图片摘录失败或 fetch 时报错（CORS/403/非 http(s) 链接等）:
  - 这是浏览器网络策略和目标服务器返回头造成的。扩展会在 fetch 失败时仍保存 `imageUrl`（不保存 base64）；建议在导出时手动检查大图片或使用外部存储。
  - 为避免占用大量 `chrome.storage.local` 空间，可在将来把图片上传到云存储并仅存储链接。

- 导入后出现重复笔记:
  - 导入逻辑采用 DOI + 正文严格匹配或标题 + 正文严格匹配来判断重复；如果来源不同但内容相同，可能被视为不同条目。

**开发者提示 & 调试**
- 日志与 Service Worker：扩展使用 MV3 background service worker。要查看日志，请在 `chrome://extensions/` 找到扩展并点击 `service worker` 的 `Inspect views` 打开 DevTools 控制台。
- 常用调试点：
  - `content.js` 的 `extractMetadata()` 会在页面 Console 打印提取结果（JSON-LD、meta 标签等）。
  - `background.js` 负责右键事件、图片 fetch、CrossRef 补全与保存；可以在 Service Worker Console 看到注入与保存日志。
  - `sidepanel.js` 负责 UI 渲染、搜索、导入导出与关键词管理。
- 本地测试命令（没有额外依赖）：
```bash
# 仅需在 Chrome 中加载已解压扩展，以下为手动检查建议
# 打开扩展页：
open "chrome://extensions/"
```

**安全与限制**
- 因为图片可能以 base64 存储在 `chrome.storage.local`，大量或高分辨率图片会消耗配额，请谨慎使用图片嵌入功能。
- 对于需要长期同步或团队共享，建议后续接入云后端（例如 Firebase / Supabase / 自建 API + DB），当前版本只支持导出/导入 JSON 的离线共享。

**扩展点 / 未来计划**
- 增量同步与用户认证（云端）：支持按用户/组同步数据并解决冲突。
- 图片缩略与外部储存：避免将大图片以 base64 存入本地存储。
- 更精细的重复检测与导入选择界面：导入前预览、选择性合并条目。
- 高亮搜索结果、全文索引以支持更快的大量数据检索。

**贡献**
欢迎提交 Issue 或 PR（请在 PR 中说明改动与测试方法）。
