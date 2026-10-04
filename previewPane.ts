import { ItemView, Notice, TAbstractFile, WorkspaceLeaf, setIcon } from 'obsidian';
import type Markdown2WechatHtmlPlugin from './main';
import { getAllThemes } from './themeManager';
import { MarkdownConverter, htmlToFragment } from './markdownConverter';

export const VIEW_TYPE_WECHAT_PREVIEW = 'wechat-html-preview';
export const RIBBON_ICON_TEXT = 'WeChat rich text preview';

/**
 * 预览面板类，负责在 Obsidian 右侧显示实时 HTML 预览，支持主题切换、复制、关闭等。
 */
export class WechatHtmlPreviewView extends ItemView {
    plugin: Markdown2WechatHtmlPlugin;
    converter: MarkdownConverter;
    previewEl!: HTMLElement;
    toolbarEl: HTMLElement | null = null;
    private lastActiveFilePath: string | null = null;

    /**
     * 构造函数，初始化转换器等。
     */
    constructor(leaf: WorkspaceLeaf, plugin: Markdown2WechatHtmlPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.converter = new MarkdownConverter();
    }

    /**
     * 返回视图类型标识。
     */
    getViewType(): string {
        return VIEW_TYPE_WECHAT_PREVIEW;
    }

    /**
     * 返回视图标题文本。
     */
    getDisplayText(): string {
        return RIBBON_ICON_TEXT;
    }

    /**
     * 视图打开时初始化 UI、监听事件。
     */
    async onOpen(): Promise<void> {
        // 优先插入到 view-content 内，避免顶部空隙
        const viewContent = this.containerEl.querySelector<HTMLElement>('.view-content');
        const host = viewContent ?? this.containerEl;
        host.addClass('wechat-html-preview');
        this.previewEl = host.createDiv('wechat-html-preview');

        // 工具条先插入内容区顶部
        const toolbar = this.previewEl.createDiv('wechat-html-toolbar');
        this.toolbarEl = toolbar;
        this.renderToolbar(toolbar);

        // 渲染初始内容
        await this.renderPreview(true);

        // 工具条移动到 view-header 后新建的 nav-header 内
        const viewHeader = this.containerEl.querySelector('.view-header');
        if (viewHeader) {
            let navHeader = viewHeader.nextElementSibling;
            if (!navHeader || !navHeader.classList.contains('nav-header')) {
                navHeader = createDiv({ cls: 'nav-header wechat-nav-header' });
                viewHeader.parentNode?.insertBefore(navHeader, viewHeader.nextSibling);
            }
            navHeader.appendChild(toolbar);
        }

        // 监听文档切换与内容变更
        this.registerEvent(this.app.workspace.on('active-leaf-change', this.onActiveLeafChange));
        this.registerEvent(this.app.vault.on('modify', this.onFileModify));
    }

    /**
     * 文档切换时触发，刷新预览。
     */
    private readonly onActiveLeafChange = (): void => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.path === this.lastActiveFilePath) return;
        this.lastActiveFilePath = file.path;
        void this.renderPreview(true); // 滚动条归零
    };

    /**
     * 文档内容变更时触发，刷新预览。
     */
    private readonly onFileModify = (file: TAbstractFile): void => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || file.path !== activeFile.path) return;
        void this.renderPreview(false); // 保持滚动条
    };

    /**
     * 渲染顶部工具栏（主题选择、复制、关闭）。
     */
    renderToolbar(toolbar?: HTMLElement): void {
        const target = toolbar ?? this.toolbarEl;
        if (!target) return;
        target.empty();

        // 左侧：主题选择
        const left = createDiv({ cls: 'left' });
        const themeSelect = left.createEl('select');
        themeSelect.className = 'wechat-theme-select dropdown';
        for (const theme of getAllThemes(this.plugin.settings)) {
            themeSelect.createEl('option', { text: theme.name, value: theme.name });
        }
        themeSelect.value = this.plugin.settings.defaultTheme;
        themeSelect.onchange = () => {
            void this.onThemeChange(themeSelect.value);
        };
        target.appendChild(left);

        // 中间：复制按钮
        const center = createDiv({ cls: 'center' });
        const copyBtn = center.createEl('button', { text: 'Copy HTML' });
        copyBtn.addClass('wechat-toolbar-btn');
        copyBtn.onclick = () => {
            void this.copyHtml();
        };
        target.appendChild(center);

        // 右侧：关闭按钮
        const right = createDiv({ cls: 'right' });
        const closeBtn = right.createEl('button', { cls: 'close' });
        setIcon(closeBtn, 'x');
        closeBtn.setAttribute('aria-label', 'Close preview');
        closeBtn.onclick = () => {
            this.app.workspace.detachLeavesOfType(VIEW_TYPE_WECHAT_PREVIEW);
        };
        target.appendChild(right);
    }

    /**
     * 切换主题：保存设置并刷新预览。
     */
    private async onThemeChange(value: string): Promise<void> {
        this.plugin.settings.defaultTheme = value;
        await this.plugin.saveSettings();
        await this.plugin.refreshAllThemeSelectors();
        await this.renderPreview(true);
    }

    /**
     * 把当前预览的 HTML 以 text/html 形式写入剪贴板。
     */
    private async copyHtml(): Promise<void> {
        const html = await this.getPreviewHtml();
        await navigator.clipboard.write([
            new ClipboardItem({
                'text/html': new Blob([html], { type: 'text/html' }),
            }),
        ]);
        new Notice('HTML copied to clipboard');
    }

    /**
     * 渲染 HTML 预览内容。
     */
    private async renderPreview(resetScroll: boolean): Promise<void> {
        // 记录刷新前的滚动位置
        const prevScrollTop = this.previewEl ? this.previewEl.scrollTop : 0;
        // 清空旧内容
        this.previewEl.querySelectorAll('.wechat-html-content').forEach(el => el.remove());

        const file = this.app.workspace.getActiveFile();
        if (!file) return;
        this.converter.setVaultAndFile(this.app.vault, file);

        const current = this.plugin.settings.defaultTheme;
        const theme = getAllThemes(this.plugin.settings).find(t => t.name === current);
        const css = theme ? theme.css : '';
        const markdown = await this.app.vault.read(file);
        const html = this.converter.convert(markdown, css);

        const contentDiv = this.previewEl.createDiv('wechat-html-content');
        contentDiv.appendChild(htmlToFragment(html));

        // 决定滚动条行为
        this.previewEl.scrollTop = resetScroll ? 0 : prevScrollTop;
    }

    /**
     * 获取当前文档的 HTML 预览源码。
     */
    async getPreviewHtml(): Promise<string> {
        const file = this.app.workspace.getActiveFile();
        if (!file) return '';
        this.converter.setVaultAndFile(this.app.vault, file);
        const current = this.plugin.settings.defaultTheme;
        const theme = getAllThemes(this.plugin.settings).find(t => t.name === current);
        const markdown = await this.app.vault.read(file);
        return this.converter.convert(markdown, theme ? theme.css : '');
    }

    /**
     * 视图关闭时清理 UI。
     */
    onClose(): void {
        this.previewEl?.remove();
    }
}
