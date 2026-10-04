# 古思排版

> Obsidian 插件：把 Markdown 实时转成可直接粘贴进微信公众号的富文本 HTML。右侧即时预览，一键复制，内置四套中文排版主题。

**English**: An Obsidian plugin that converts your Markdown note into WeChat-compatible rich text HTML in real time. Preview in a side pane, copy with one click. Four built-in Chinese typography themes.

---

## 它能干什么

- **实时转换**：Markdown → 微信公众号可直接粘贴的富文本 HTML，样式全部内联（微信只认内联样式）
- **侧栏预览**：右侧面板即时看到排版后的真实效果，所见即所得
- **一键复制**：复制后直接粘进公众号后台，不用再调格式
- **四套内置主题**：装完就有，不用自己粘贴 CSS
- **自定义主题**：可以在设置里新增、编辑、删除自己的 CSS 主题，也能一键导出当前主题的 CSS

## 内置主题

| 主题 | 气质 | 适合 |
|---|---|---|
| **默认主题** | 报刊骨架，黑白灰 + 唯一一点黄，标题左对齐（仿 Monocle） | 不挑字体，通用长文 |
| **古思** | 苹方系公众号正文流 | 日常公众号推送 |
| **古思·全端一致** | 霞鹜文楷，暖白底，深色标题，零装饰 | 品牌统一的专栏文章 |
| **宣纸水墨** | 宣纸底、朱砂标题、行高 2.05 的慢读节奏 | 随笔、书评、需要呼吸感的文章 |

四套主题都为微信公众号环境做过适配：不使用伪元素、伪类和媒体查询（这些在微信里会被丢弃），圆角克制，行高显式声明。

## 安装

**方式一**：Obsidian → 设置 → 第三方插件 → 社区插件市场 → 搜索「古思排版」→ 安装并启用。

**方式二（手动）**：从 GitHub Releases 下载最新的 `main.js`、`manifest.json`、`styles.css`，放到 `<你的库>/.obsidian/plugins/gusi-formatter/` 下，重启 Obsidian 启用。

## 使用

1. 打开一篇 Markdown 笔记
2. 打开侧栏的排版预览面板
3. 在工具栏的下拉里选主题
4. 点「复制 HTML」，粘贴到公众号后台

## 自定义主题

设置 → 古思排版 → Custom Theme Management → Add Custom Theme，粘贴 CSS 即可。

主题 CSS 的写法：最外层容器是 `section#markdown2wechatHtml`，子元素写 `p` / `h1`–`h4` / `blockquote` / `pre code.hljs` 等。头部可以写注释声明主题名：

```css
/**
 * name: 我的主题
 * description: 一句话说明
 */
```

## 构建（开发者）

```bash
npm install
npm run build     # 产出在 dist/gusi-formatter/
npm run deploy    # 复制到本机 vault（路径见 package.json）
```

构建使用 esbuild（原项目的 rollup + rollup-plugin-typescript2 链在当前 Node 下已失效）。新增内置主题：往 `themes/` 里放一个 CSS 文件即可，`prebuild` 会自动生成索引，不需要改 TypeScript 代码。

## 来源与许可

本项目 fork 自 [imhaiqiao/obsidian-convert-markdown-to-html-plugin](https://github.com/imhaiqiao/obsidian-convert-markdown-to-html-plugin)，原作者 Haiqiao，在此致谢。核心转换与预览逻辑来自原项目，本项目主要增加了中文排版主题与微信端适配。

MIT License，详见 [LICENSE](./LICENSE)。
