// markdown转换模块
// 负责将markdown文本转为微信公众号富文本HTML，支持代码高亮和内联样式

import MarkdownIt from 'markdown-it';
import hljs from 'markdown-it-highlightjs';
import juice from 'juice';
import markdownItKatex from 'markdown-it-katex';
import 'katex/dist/katex.min.css';
import { Vault, TFile } from 'obsidian';

/**
 * Markdown 转换器类，负责将 Markdown 文本转为微信公众号富文本 HTML。
 */
export class MarkdownConverter {
    md: MarkdownIt;
    vault: Vault | null = null;
    activeFile: TFile | null = null;

    /**
     * 构造函数，初始化 markdown-it、代码高亮、LaTeX 支持等。
     */
    constructor() {
        this.md = new MarkdownIt({
            html: true,
            linkify: true,
            typographer: true,
        });
        this.md.use(hljs); // 启用 highlightjs 插件
        this.md.use(markdownItKatex); // 启用 LaTeX 支持
        
        // 屏蔽 highlightjs 未知语言报错
        const origConsoleError = console.error;
        console.error = function (...args) {
            if (typeof args[0] === 'string' && args[0].includes('Could not find the language')) {
                // 静默忽略
                return;
            }
            origConsoleError.apply(console, args);
        };
        
        // 自定义代码块渲染器：将 code 内换行替换为 <br/>
        const fence = this.md.renderer.rules.fence;
        this.md.renderer.rules.fence = (tokens, idx, options, env, self) => {
            const token = tokens[idx];
            // 原始渲染
            let codeHtml = fence ? fence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
            // 只处理 <code>...</code> 内部内容
            codeHtml = codeHtml.replace(/<code([\s\S]*?)>([\s\S]*?)<\/code>/g, (m, attrs, content) => {
                // 将内容中的 \n 替换为 <br/>
                const replaced = content.replace(/\n/g, '<br/>');
                return `<code${attrs}>${replaced}</code>`;
            });
            return codeHtml;
        };
    }

    /**
     * 设置当前 vault 和文件，便于图片路径处理。
     * @param vault Obsidian 的 Vault 实例
     * @param activeFile 当前激活的文件
     */
    setVaultAndFile(vault: Vault, activeFile: TFile) {
        this.vault = vault;
        this.activeFile = activeFile;
    }

    /**
     * 将 Markdown 文本转为内联样式 HTML（去除 YAML 属性块，仅 section 包裹内容）。
     * @param markdown 源 markdown 文本
     * @param css 主题样式（css片段）
     * @returns 内联样式的 HTML 字符串
     */
    convert(markdown: string, css: string): string {
        // 1. 去除YAML frontmatter属性块
        const cleaned = markdown.replace(/^---[\s\S]*?---\s*/, '');
        // 2. 转为HTML
        const rawHtml = this.md.render(cleaned);
        // 3. 用<section>包裹内容
        const htmlWithSection = `<section id="markdown2wechatHtml">${rawHtml}</section>`;
        // 4. 内联样式
        const inlinedHtml = juice.inlineContent(htmlWithSection, css);
        let html = this.fixImageSrc(inlinedHtml);
        return html;
    }

    /**
     * 修正 HTML 中图片的 src 路径，适配 Obsidian 资源。
     * @param html HTML 字符串
     * @returns 修正后的 HTML 字符串
     */
    fixImageSrc(html: string): string {
        if (!this.vault) return html;
        const div = document.createElement('div');
        div.innerHTML = html;
        div.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src');
            if (!src) return;
            // 绝对路径直接跳过
            if (src.startsWith('/') || src.startsWith('file://') || src.match(/^https?:\/\//)) return;
            // 相对路径处理
            let file = this.vault!.getAbstractFileByPath(src);
            if (!file && this.activeFile) {
                // 以当前文档为基准的相对路径
                const basePath = this.activeFile.parent?.path ? this.activeFile.parent.path + '/' : '';
                file = this.vault!.getAbstractFileByPath(basePath + src);
            }
            if (file && file instanceof TFile) {
                const resourcePath = this.vault!.getResourcePath(file);
                img.setAttribute('src', resourcePath);
            }
        });
        return div.innerHTML;
    }
} 