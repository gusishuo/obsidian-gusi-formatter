import { ItemView, Notice, TAbstractFile, WorkspaceLeaf, setIcon, setTooltip } from 'obsidian';
import type Markdown2WechatHtmlPlugin from './main';
import { getAllThemes } from './themeManager';
import { MarkdownConverter, htmlToFragment } from './markdownConverter';
import {
    SYNC_MODE_LABELS,
    SYNC_OFF_ICON,
    SYNC_OFF_LABEL,
    SYNC_ON_ICON,
    SYNC_ON_LABEL,
    ScrollSyncController,
    ScrollSyncHost,
    ScrollSyncMode,
} from './scrollSync';

export const VIEW_TYPE_WECHAT_PREVIEW = 'wechat-html-preview';
export const RIBBON_ICON_TEXT = 'WeChat rich text preview';

/**
 * 预览面板类，负责在 Obsidian 右侧显示实时 HTML 预览，支持主题切换、复制、关闭等。
 */
export class WechatHtmlPreviewView extends ItemView implements ScrollSyncHost {
    plugin: Markdown2WechatHtmlPlugin;
    converter: MarkdownConverter;
    previewEl!: HTMLElement;
    toolbarEl: HTMLElement | null = null;
    private lastActiveFilePath: string | null = null;
    /** 关掉同步前的方向，重新打开时恢复 */
    private lastEnabledSyncMode: ScrollSyncMode = 'forward';
    private scrollSync: ScrollSyncController;

    /**
     * 构造函数，初始化转换器等。
     */
    constructor(leaf: WorkspaceLeaf, plugin: Markdown2WechatHtmlPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.converter = new MarkdownConverter();
        this.scrollSync = new ScrollSyncController(this);
    }

    /* ============ ScrollSyncHost 实现 ============ */

    /** 供滚动同步控制器读取预览滚动容器 */
    getPreviewEl(): HTMLElement | null {
        return this.previewEl ?? null;
    }

    /** 供滚动同步控制器读取当前同步模式 */
    getSyncMode(): ScrollSyncMode {
        return this.plugin.settings.scrollSync;
    }

    /* ============================================ */

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
        this.registerEvent(this.app.workspace.on('layout-change', this.onLayoutChange));
        this.registerEvent(this.app.vault.on('modify', this.onFileModify));

        // 启动编辑区 ↔ 预览区滚动同步
        this.scrollSync.attach();
    }

    /**
     * 文档切换时触发，刷新预览。
     */
    private readonly onActiveLeafChange = (): void => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.path === this.lastActiveFilePath) return;
        this.lastActiveFilePath = file.path;
        this.scrollSync.rebindEditor();
        void this.renderPreview(true);
    };

    /**
     * 布局变化（切换标签页、开关面板）后重新绑定编辑器滚动容器。
     */
    private readonly onLayoutChange = (): void => {
        this.scrollSync.rebindEditor();
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

        // 中间：同步开关 + 复制按钮
        const center = createDiv({ cls: 'center' });
        const syncOn = this.scrollSync.isEnabled();
        const syncBtn = center.createEl('button', { cls: 'wechat-toolbar-btn' });
        setIcon(syncBtn, syncOn ? SYNC_ON_ICON : SYNC_OFF_ICON);
        syncBtn.setAttribute('aria-label', syncOn ? SYNC_ON_LABEL : SYNC_OFF_LABEL);
        setTooltip(syncBtn, syncOn ? `${SYNC_ON_LABEL} — ${SYNC_MODE_LABELS[this.plugin.settings.scrollSync]}` : SYNC_OFF_LABEL);
        syncBtn.toggleClass('is-off', !syncOn);
        syncBtn.onclick = () => {
            void this.toggleScrollSync();
        };
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
     * 一键开关滚动同步：关掉时记住原方向，再打开时恢复。
     */
    private async toggleScrollSync(): Promise<void> {
        const current = this.plugin.settings.scrollSync;
        let next: ScrollSyncMode;
        if (current === 'off') {
            next = this.lastEnabledSyncMode;
        } else {
            this.lastEnabledSyncMode = current;
            next = 'off';
        }
        this.plugin.settings.scrollSync = next;
        await this.plugin.saveSettings();
        this.scrollSync.applyMode();
        this.renderToolbar();
        new Notice(next === 'off' ? 'Scroll sync off' : `Scroll sync on (${SYNC_MODE_LABELS[next]})`);
    }

    /** 供插件在设置页切换模式时调用 */
    applyScrollSyncMode(): void {
        const mode = this.plugin.settings.scrollSync;
        if (mode !== 'off') this.lastEnabledSyncMode = mode;
        this.scrollSync.applyMode();
        this.renderToolbar();
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
        // 记录刷新前的位置：优先用行号锚点，锚点不可用时退回像素
        const anchorLine = resetScroll ? null : this.scrollSync.captureAnchorLine();
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
        // 预览路径开启行号锚点，供滚动同步按内容对齐
        const html = this.converter.convert(markdown, css, { lineMarkers: true });

        const contentDiv = this.previewEl.createDiv('wechat-html-content');
        contentDiv.appendChild(htmlToFragment(html));

        if (resetScroll) {
            this.previewEl.scrollTop = 0;
            // 打开文档时跟随编辑器当前位置，而不是一律回到顶部
            this.scrollSync.alignPreviewToEditor();
            return;
        }
        if (anchorLine !== null) {
            this.scrollSync.alignPreviewToLine(anchorLine);
            return;
        }
        this.previewEl.scrollTop = prevScrollTop;
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
    async onClose(): Promise<void> {
        this.scrollSync.detach();
        this.previewEl?.remove();
    }
}
