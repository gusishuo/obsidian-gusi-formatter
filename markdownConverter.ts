import MarkdownIt from 'markdown-it';
import type { Options, Renderer, Token } from 'markdown-it';
import hljs from 'markdown-it-highlightjs';
import juice from 'juice';
import markdownItKatex from 'markdown-it-katex';
import 'katex/dist/katex.min.css';
import { TFile, Vault } from 'obsidian';

type RenderRule = (tokens: Token[], idx: number, options: Options, env: unknown, self: Renderer) => string;

/** 转换选项 */
export interface ConvertOptions {
    /**
     * 是否给每个顶层块级元素写入 `data-line`（源文件行号，从 0 开始）。
     * 预览面板靠它做滚动同步；复制出去的 HTML 不需要，所以复制时不开启。
     */
    lineMarkers?: boolean;
}

/** render 的 env 里携带的内部配置 */
interface ConvertEnv {
    lineMarkers: boolean;
    /** 去掉 frontmatter 造成的行号偏移 */
    lineOffset: number;
}

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

        // 给顶层块级元素打上源文件行号，供预览面板做滚动同步
        this.md.core.ruler.push('gusi_line_markers', state => {
            const env = state.env as Partial<ConvertEnv>;
            if (!env || !env.lineMarkers) return true;
            const offset = env.lineOffset ?? 0;
            for (const token of state.tokens) {
                if (token.level !== 0) continue;
                if (token.nesting === -1) continue;
                if (!token.map) continue;
                token.attrSet('data-line', String(token.map[0] + offset));
            }
            return true;
        });
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
     * @param options.lineMarkers 预览面板需要行号锚点时开启；复制路径保持关闭，输出干净的 HTML。
     */
    convert(markdown: string, css: string, options: ConvertOptions = {}): string {
        // 1. 去除 YAML frontmatter 属性块，并记录被删掉的行数用于行号换算
        const match = /^---[\s\S]*?---\s*/.exec(markdown);
        const cleaned = match ? markdown.slice(match[0].length) : markdown;
        const lineOffset = match ? (match[0].match(/\n/g) ?? []).length : 0;
        // 2. 转为 HTML
        const env: ConvertEnv = { lineMarkers: options.lineMarkers === true, lineOffset };
        const rawHtml = this.md.render(cleaned, env);
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
