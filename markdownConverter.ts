import MarkdownIt from 'markdown-it';
import type { Options, Renderer, Token } from 'markdown-it';
import hljs from 'markdown-it-highlightjs';
import juice from 'juice';
import markdownItKatex from 'markdown-it-katex';
import 'katex/dist/katex.min.css';
import { TFile, Vault } from 'obsidian';

type RenderRule = (tokens: Token[], idx: number, options: Options, env: unknown, self: Renderer) => string;

/**
 * 把一段 HTML 字符串解析成可安全插入 DOM 的 DocumentFragment。
 * 不使用 innerHTML 赋值，避免污染与转义问题。
 */
export function htmlToFragment(html: string): DocumentFragment {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const fragment = createFragment();
    fragment.append(...Array.from(parsed.body.childNodes));
    return fragment;
}

/**
 * Markdown 转换器类，负责将 Markdown 文本转为微信公众号富文本 HTML。
 */
export class MarkdownConverter {
    private readonly md: MarkdownIt;
    private vault: Vault | null = null;
    private activeFile: TFile | null = null;

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

        // 自定义代码块渲染器：将 code 内换行替换为 <br/>
        const defaultFence: RenderRule | undefined = this.md.renderer.rules.fence;
        this.md.renderer.rules.fence = (tokens, idx, options, env, self) => {
            const codeHtml = defaultFence
                ? defaultFence(tokens, idx, options, env, self)
                : self.renderToken(tokens, idx, options);
            return codeHtml.replace(/<code([\s\S]*?)>([\s\S]*?)<\/code>/g, (_match, attrs, content) => {
                const replaced = String(content).replace(/\n/g, '<br/>');
                return `<code${attrs}>${replaced}</code>`;
            });
        };

        // 自定义图片渲染器：把 Obsidian 相对路径换成可用资源地址
        const defaultImage: RenderRule | undefined = this.md.renderer.rules.image;
        this.md.renderer.rules.image = (tokens, idx, options, env, self) => {
            const token = tokens[idx];
            const srcIndex = token.attrIndex('src');
            if (srcIndex >= 0 && token.attrs) {
                token.attrs[srcIndex][1] = this.resolveImageSrc(token.attrs[srcIndex][1]);
            }
            return defaultImage
                ? defaultImage(tokens, idx, options, env, self)
                : self.renderToken(tokens, idx, options);
        };
    }

    /**
     * 设置当前 vault 和文件，便于图片路径处理。
     */
    setVaultAndFile(vault: Vault, activeFile: TFile): void {
        this.vault = vault;
        this.activeFile = activeFile;
    }

    /**
     * 将 Markdown 文本转为内联样式 HTML（去除 YAML 属性块，仅 section 包裹内容）。
     */
    convert(markdown: string, css: string): string {
        // 1. 去除 YAML frontmatter 属性块
        const cleaned = markdown.replace(/^---[\s\S]*?---\s*/, '');
        // 2. 转为 HTML
        const rawHtml = this.md.render(cleaned);
        // 3. 用 <section> 包裹内容
        const htmlWithSection = `<section id="markdown2wechatHtml">${rawHtml}</section>`;
        // 4. 内联样式
        return juice.inlineContent(htmlWithSection, css);
    }

    /**
     * 解析图片 src，把 vault 内的相对路径换成 Obsidian 资源地址。
     */
    private resolveImageSrc(src: string): string {
        if (!this.vault || !src) return src;
        // 绝对路径直接跳过
        if (src.startsWith('/') || src.startsWith('file://') || /^https?:\/\//.test(src)) return src;
        let file = this.vault.getAbstractFileByPath(src);
        if (!(file instanceof TFile) && this.activeFile) {
            // 以当前文档为基准的相对路径
            const basePath = this.activeFile.parent?.path ? `${this.activeFile.parent.path}/` : '';
            file = this.vault.getAbstractFileByPath(basePath + src);
        }
        if (file instanceof TFile) {
            return this.vault.getResourcePath(file);
        }
        return src;
    }
}
