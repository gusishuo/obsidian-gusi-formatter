// 预览面板模块
// 负责在Obsidian右侧显示实时HTML预览，支持主题切换、复制、关闭、滚动同步等功能

// @ts-ignore
import { ItemView, WorkspaceLeaf, App, Notice } from 'obsidian';
import { ThemeManager, getAllThemes } from './themeManager';
import { MarkdownConverter } from './markdownConverter';

export const VIEW_TYPE_WECHAT_PREVIEW = 'wechat-html-preview';
export const RIBBON_ICON_TEXT = 'WeChat Rich Text Preview';

/**
 * 预览面板类，负责在 Obsidian 右侧显示实时 HTML 预览，支持主题切换、复制、关闭等。
 */
export class WechatHtmlPreviewView extends ItemView {
    plugin: any;
    themeManager: ThemeManager;
    converter: MarkdownConverter;
    previewEl!: HTMLElement;
    toolbarEl: HTMLElement | null = null;
    scrollSync: boolean = true;
    activeFileListener: any = null;
    fileSaveListener: any = null;
    lastActiveFilePath: string | null = null;

    /**
     * 构造函数，初始化主题管理器、转换器等。
     */
    constructor(leaf: WorkspaceLeaf, plugin: any) {
        super(leaf);
        this.plugin = plugin;
        this.themeManager = new ThemeManager(plugin);
        this.converter = new MarkdownConverter();
    }

    /**
     * 返回视图类型标识。
     */
    getViewType() {
        return VIEW_TYPE_WECHAT_PREVIEW;
    }

    /**
     * 返回视图标题文本。
     */
    getDisplayText() {
        return RIBBON_ICON_TEXT;
    }

    /**
     * 视图打开时初始化 UI、监听事件。
     */
    async onOpen() {
        // 优先插入到view-content内，避免顶部空隙
        // @ts-ignore
        const viewContent = this.containerEl.querySelector('.view-content') as HTMLElement;
        if (viewContent) viewContent.style.padding = '0';
        if (viewContent) viewContent.classList.add('wechat-html-preview');
        this.previewEl = (viewContent ?? this.containerEl).createDiv('wechat-html-preview');
        // 工具条先插入内容区顶部
        const toolbar = this.previewEl.createDiv('wechat-html-toolbar');
        this.toolbarEl = toolbar;
        this.toolbarEl.classList.add('wechat-html-toolbar');
        this.renderToolbar(toolbar);
        // 渲染初始内容
        await this.renderPreview('onOpen', true);
        // 工具条移动到view-header后新建的nav-header内
        const viewHeader = this.containerEl.querySelector('.view-header') as HTMLElement;
        if (viewHeader) {
            let navHeader = viewHeader.nextElementSibling as HTMLElement;
            if (!navHeader || !navHeader.classList.contains('nav-header')) {
                navHeader = document.createElement('div');
                navHeader.className = 'nav-header wechat-nav-header';
                viewHeader.parentNode?.insertBefore(navHeader, viewHeader.nextSibling);
            }
            navHeader.appendChild(toolbar);
        }
        // 监听文档切换
        this.activeFileListener = this.onActiveLeafChange;
        this.plugin.app.workspace.on('active-leaf-change', this.activeFileListener);
        // 监听内容变更
        this.fileSaveListener = this.onFileModify;
        this.plugin.app.vault.on('modify', this.fileSaveListener);
    }

    /**
     * 文档切换时触发，刷新预览。
     */
    onActiveLeafChange = async () => {
        const activeLeaf = this.plugin.app.workspace.activeLeaf;
        if (!activeLeaf || activeLeaf.getViewState().type !== 'markdown') return;
        const file = this.plugin.app.workspace.getActiveFile();
        if (!file) return;
        if (file.path !== this.lastActiveFilePath) {
            this.lastActiveFilePath = file.path;
            await this.renderPreview('switch-file', true); // 滚动条归零
        }
    }

    /**
     * 文档内容变更时触发，刷新预览。
     */
    onFileModify = async (file: any) => {
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile || file.path !== activeFile.path) return;
        await this.renderPreview('modify', false); // 保持滚动条
    }

    /**
     * 渲染顶部工具栏（主题选择、复制、关闭）。
     */
    async renderToolbar(toolbar?: HTMLElement) {
        if (!toolbar) toolbar = this.toolbarEl as HTMLElement;
        if (!toolbar) return;
        toolbar.empty?.(); // 清空旧内容
        // 左侧：主题选择
        const left = document.createElement('div');
        left.className = 'left';
        // 获取所有主题
        const allThemes = this.plugin.themeManager ? getAllThemes(this.plugin.settings) : [];
        // 当前主题：优先用全局默认
        let curTheme = this.plugin.settings.defaultTheme;
        // 主题选择器
        const themeSelect = left.createEl('select');
        themeSelect.className = 'wechat-theme-select dropdown';
        for (const theme of allThemes) {
            themeSelect.createEl('option', { text: theme.name, value: theme.name });
        }
        themeSelect.value = curTheme;
        themeSelect.onchange = async () => {
            this.plugin.settings.defaultTheme = themeSelect.value;
            await this.plugin.saveSettings?.();
            await this.plugin.refreshAllThemeSelectors?.();
            await this.renderPreview('theme-change', true); // 切换主题归零
        };
        toolbar.appendChild(left);
        // 中间：复制按钮
        const center = document.createElement('div');
        center.className = 'center';
        const copyBtn = center.createEl('button', { text: 'Copy HTML' });
        copyBtn.addClass('wechat-toolbar-btn');
        copyBtn.onclick = async () => {
            const html = await this.getPreviewHtml();
            await navigator.clipboard.write([
                new ClipboardItem({
                    'text/html': new Blob([html], { type: 'text/html' })
                })
            ]);
            // @ts-ignore
            new window.Notice('HTML copied to clipboard');
        };
        toolbar.appendChild(center);
        // 右侧：关闭按钮
        const right = document.createElement('div');
        right.className = 'right';
        const closeBtn = right.createEl('button');
        closeBtn.classList.add('close');
        closeBtn.innerHTML = '&times;'; // [x]图标
        closeBtn.title = 'Close';
        closeBtn.onclick = () => {
            this.plugin.app.workspace.detachLeavesOfType(VIEW_TYPE_WECHAT_PREVIEW);
        };
        toolbar.appendChild(right);
    }

    /**
     * 渲染 HTML 预览内容。
     */
    async renderPreview(trigger: string = '', resetScroll: boolean = false) {
        // 记录刷新前的滚动位置（针对.wechat-html-preview）
        let prevScrollTop = 0;
        if (this.previewEl) {
            prevScrollTop = this.previewEl.scrollTop;
        }
        // 清空旧内容
        this.previewEl.querySelectorAll('.wechat-html-content').forEach(el => el.remove());
        // 获取当前文档路径
        const file = this.plugin.app.workspace.getActiveFile();
        if (!file) {
            return;
        }
        // 设置图片路径处理上下文
        this.converter.setVaultAndFile(this.plugin.app.vault, file);
        // 获取所有主题
        const allThemes = this.plugin.themeManager ? getAllThemes(this.plugin.settings) : [];
        // 当前主题：优先用全局默认
        let curTheme = this.plugin.settings.defaultTheme;
        // 获取主题CSS
        const theme = allThemes.find(t => t.name === curTheme);
        const css = theme ? theme.css : '';
        // 获取当前文档markdown内容
        const markdown = await this.plugin.app.vault.read(file);
        // 转换为HTML
        const html = this.converter.convert(markdown, css);
        // 显示内容
        // @ts-ignore
        const contentDiv = this.previewEl.createDiv('wechat-html-content');
        contentDiv.innerHTML = html;
        // 根据来源决定滚动条行为（操作.wechat-html-preview）
        if (resetScroll) {
            this.previewEl.scrollTop = 0;
        } else {
            this.previewEl.scrollTop = prevScrollTop;
        }
    }

    /**
     * 获取当前文档的 HTML 预览源码。
     */
    async getPreviewHtml(): Promise<string> {
        // 获取当前文档markdown内容并转换为HTML
        const file = this.plugin.app.workspace.getActiveFile();
        if (!file) return '';
        // 获取所有主题
        const allThemes = this.plugin.themeManager ? getAllThemes(this.plugin.settings) : [];
        // 当前主题：优先用全局默认
        let curTheme = this.plugin.settings.defaultTheme;
        // 获取主题CSS
        const theme = allThemes.find(t => t.name === curTheme);
        const css = theme ? theme.css : '';
        const markdown = await this.plugin.app.vault.read(file);
        return this.converter.convert(markdown, css);
    }

    /**
     * 视图关闭时清理 UI、注销监听。
     */
    async onClose() {
        // 清理操作
        this.previewEl?.remove();
        // 注销监听，避免内存泄漏
        if (this.activeFileListener) {
            this.plugin.app.workspace.off('active-leaf-change', this.activeFileListener);
            this.activeFileListener = null;
        }
        if (this.fileSaveListener) {
            this.plugin.app.vault.off('modify', this.fileSaveListener);
            this.fileSaveListener = null;
        }
    }
} 