# gusi formatter

> An Obsidian plugin that converts Markdown into WeChat-ready rich text HTML in real time — live preview in the side pane, one-click copy, four built-in Chinese typography themes.

**古思排版**：把 Markdown 实时转成可直接粘贴进微信公众号的富文本 HTML，右侧即时预览、一键复制，内置四套中文排版主题。

## Features

- **Real-time conversion** — Markdown → rich text HTML with all styles inlined (WeChat only accepts inline styles)
- **Side pane preview** — see the real typography as you type, what you see is what you paste
- **Scroll sync** — the preview follows the editor line by line, so scrolling to the bottom of your note takes the preview with it
- **One-click copy** — paste straight into the WeChat editor, no reformatting
- **Four built-in themes** — ready out of the box, no CSS pasting needed
- **Custom themes** — add, edit and delete your own CSS themes in the settings, and export any theme's CSS with one click

## Built-in themes

| Theme | Look | Good for |
|---|---|---|
| **默认主题** (Default) | Editorial skeleton, black/white/grey with a single accent of yellow, left-aligned headings (Monocle-like) | General long-form writing |
| **古思** (Gusi) | Clean sans-serif body flow | Everyday WeChat posts |
| **古思·全端一致** (Gusi Consistent) | LXGW WenKai, warm white background, dark headings, zero decoration | Brand-consistent columns |
| **宣纸水墨** (Xuanzhi Ink) | Rice-paper background, cinnabar headings, 2.05 line height for slow reading | Essays, book reviews, airy articles |

All four themes are adapted for the WeChat editor: no pseudo-elements, pseudo-classes or media queries (those get stripped by WeChat), restrained border radius, explicit line height.

## Installation

**From the community plugins directory**: Obsidian → Settings → Community plugins → Browse → search "gusi formatter" → Install & enable.

**Manually**: download `main.js`, `manifest.json` and `styles.css` from the latest [GitHub release](https://github.com/gusishuo/obsidian-gusi-formatter/releases) into `<your vault>/.obsidian/plugins/gusi-formatter/`, then restart Obsidian and enable the plugin.

## Usage

1. Open a Markdown note
2. Click the eye icon in the left ribbon to open the preview pane
3. Pick a theme from the toolbar dropdown
4. Click "Copy HTML" and paste into the WeChat editor

## Scroll sync

The preview pane follows the editor automatically — scroll the note to the bottom and the preview goes with it. Alignment is line-based (each block carries its source line number), not percentage-based, so the preview lands on the same paragraph you are reading.

The toolbar has a small chain button next to "Copy HTML" that turns scroll sync on and off:

- **on** (accent colour) — the preview follows the editor
- **off** (greyed out) — the two panes scroll independently

Scrolling sync is on by default. Settings → Gusi Formatter → Scroll sync direction picks *which* side follows which: editor to preview only (default), or both directions.

## Custom themes

Settings → Gusi Formatter → Custom themes → Add custom theme, then paste your CSS.

How to write a theme: the outermost container is `section#markdown2wechatHtml`, with children like `p` / `h1`–`h4` / `blockquote` / `pre code.hljs`. Declare the theme name in a header comment:

```css
/**
 * name: My theme
 * description: One line description
 */
```

## Build (developers)

```bash
npm install
npm run build     # output in dist/gusi-formatter/
```

The build uses esbuild (the original rollup + rollup-plugin-typescript2 chain no longer works on current Node). To add a built-in theme, just drop a CSS file into `themes/` — `prebuild` regenerates the index automatically, no TypeScript changes needed.

## Credits & license

Forked from [imhaiqiao/obsidian-convert-markdown-to-html-plugin](https://github.com/imhaiqiao/obsidian-convert-markdown-to-html-plugin) — thanks to the original author Haiqiao. The core conversion and preview logic come from the original project; this fork mainly adds Chinese typography themes and WeChat-specific adaptations.

MIT License, see [LICENSE](./LICENSE).

---

# 中文说明

## 它能干什么

- **实时转换**：Markdown → 微信公众号可直接粘贴的富文本 HTML，样式全部内联（微信只认内联样式）
- **侧栏预览**：右侧面板即时看到排版后的真实效果，所见即所得
- **滚动同步**：编辑区滚到哪，预览区跟到哪，按行对齐而不是按百分比
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

**方式一**：Obsidian → 设置 → 第三方插件 → 社区插件市场 → 搜索「gusi formatter」→ 安装并启用。

**方式二（手动）**：从 GitHub Releases 下载最新的 `main.js`、`manifest.json`、`styles.css`，放到 `<你的库>/.obsidian/plugins/gusi-formatter/` 下，重启 Obsidian 启用。

## 使用

1. 打开一篇 Markdown 笔记
2. 点左侧栏的眼睛图标，打开排版预览面板
3. 在工具栏的下拉里选主题
4. 点「Copy HTML」，粘贴到公众号后台

## 滚动同步

预览面板会跟着编辑区走——笔记滚到底，预览也跟到底。对齐是按行号算的（每个块都带着自己的源文件行号），不是按百分比，所以预览停靠的位置就是你正在读的那一段。

工具栏上（"Copy HTML" 旁边）有个小小的链条按钮，一键开关滚动同步：

- **开**（强调色）：预览跟随编辑区
- **关**（灰色）：两边各自独立滚动

默认是开的。设置 → Gusi Formatter → Scroll sync direction 里选「哪边跟哪边」：仅编辑区到预览（默认），或双向。

## 自定义主题

设置 → Gusi Formatter → Custom themes → Add custom theme，粘贴 CSS 即可。

主题 CSS 的写法：最外层容器是 `section#markdown2wechatHtml`，子元素写 `p` / `h1`–`h4` / `blockquote` / `pre code.hljs` 等。头部可以写注释声明主题名：

```css
/**
 * name: 我的主题
 * description: 一句话说明
 */
```

## 来源与许可

本项目 fork 自 [imhaiqiao/obsidian-convert-markdown-to-html-plugin](https://github.com/imhaiqiao/obsidian-convert-markdown-to-html-plugin)，原作者 Haiqiao，在此致谢。核心转换与预览逻辑来自原项目，本项目主要增加了中文排版主题与微信端适配。

MIT License，详见 [LICENSE](./LICENSE)。
