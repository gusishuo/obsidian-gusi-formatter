import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from 'obsidian';
import { ThemeManager, getAllThemes, isThemeNameUnique } from './themeManager';
import { WechatHtmlPreviewView, VIEW_TYPE_WECHAT_PREVIEW, RIBBON_ICON_TEXT } from './previewPane';
import {
    SYNC_MODES,
    SYNC_MODE_LABELS,
    ScrollSyncMode,
} from './scrollSync';
import { Markdown2WechatHtmlSettings } from './types';

// 默认设置：首个内置主题（themes/default.css 的 name 字段 = 东方笺谱）
const DEFAULT_SETTINGS: Markdown2WechatHtmlSettings = {
    defaultTheme: '东方笺谱',
    customThemes: {},
    scrollSync: 'forward',
};

/**
 * 插件主类，负责插件生命周期、设置加载保存、主题管理、视图注册等。
 */
export default class Markdown2WechatHtmlPlugin extends Plugin {
    declare settings: Markdown2WechatHtmlSettings;
    themeManager!: ThemeManager;
    private settingTab: Markdown2WechatHtmlSettingTab | null = null;

    /**
     * 插件加载时自动调用，初始化设置、主题、视图等。
     */
    async onload(): Promise<void> {
        await this.loadSettings();
        this.themeManager = new ThemeManager(this);
        this.settingTab = new Markdown2WechatHtmlSettingTab(this);
        this.addSettingTab(this.settingTab);
        this.registerView(
            VIEW_TYPE_WECHAT_PREVIEW,
            (leaf: WorkspaceLeaf) => new WechatHtmlPreviewView(leaf, this)
        );
        this.addRibbonIcon('eye', RIBBON_ICON_TEXT, () => {
            void this.togglePreviewView();
        });
    }

    /**
     * 打开或关闭右侧预览面板。
     */
    async togglePreviewView(): Promise<void> {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_WECHAT_PREVIEW);
        if (leaves.length > 0) {
            this.app.workspace.detachLeavesOfType(VIEW_TYPE_WECHAT_PREVIEW);
            return;
        }
        await this.activatePreviewView();
    }

    /**
     * 激活右侧预览面板。
     */
    async activatePreviewView(): Promise<void> {
        const leaf = this.app.workspace.getRightLeaf(false);
        if (!leaf) return;
        await leaf.setViewState({
            type: VIEW_TYPE_WECHAT_PREVIEW,
            active: true,
        });
        await this.app.workspace.revealLeaf(leaf);
    }

    /**
     * 加载插件设置。
     */
    async loadSettings(): Promise<void> {
        const stored = (await this.loadData()) as Partial<Markdown2WechatHtmlSettings> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
        // 旧版本数据没有 scrollSync 字段，或值非法时回落到默认模式
        if (!SYNC_MODES.includes(this.settings.scrollSync)) {
            this.settings.scrollSync = DEFAULT_SETTINGS.scrollSync;
        }
    }

    /**
     * 保存插件设置。
     */
    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    /**
     * 刷新所有主题选择器（预览页和设置页）。
     */
    async refreshAllThemeSelectors(): Promise<void> {
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_WECHAT_PREVIEW)) {
            const view = leaf.view;
            if (view instanceof WechatHtmlPreviewView) {
                view.renderToolbar();
            }
        }
        this.settingTab?.display();
    }

    /**
     * 滚动同步模式变化后，让已打开的预览面板重新绑定或解绑编辑器滚动。
     */
    applyScrollSyncMode(): void {
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_WECHAT_PREVIEW)) {
            const view = leaf.view;
            if (view instanceof WechatHtmlPreviewView) {
                view.applyScrollSyncMode();
            }
        }
    }
}

/**
 * 插件设置页类，负责渲染设置 UI、主题管理 UI。
 */
class Markdown2WechatHtmlSettingTab extends PluginSettingTab {
    plugin: Markdown2WechatHtmlPlugin;

    constructor(plugin: Markdown2WechatHtmlPlugin) {
        super(plugin.app, plugin);
        this.plugin = plugin;
    }

    /**
     * 渲染设置页内容。
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl).setName('Markdown to HTML').setHeading();
        containerEl.createEl('p', {
            text: 'Convert the current Markdown document to rich text HTML in real time, preview on the right, and copy with one click. Custom theme styles are supported.',
        });

        // 当前主题选择
        new Setting(containerEl)
            .setName('Current theme')
            .setDesc('Select the theme style to use for preview')
            .addDropdown(drop => {
                for (const theme of getAllThemes(this.plugin.settings)) {
                    drop.addOption(theme.name, theme.name);
                }
                drop.setValue(this.plugin.settings.defaultTheme);
                drop.onChange(value => {
                    this.plugin.settings.defaultTheme = value;
                    void this.applyTheme();
                });
            })
            .addExtraButton(btn => {
                btn.setIcon('copy')
                    .setTooltip('Copy current theme CSS')
                    .onClick(() => {
                        void this.copyCurrentThemeCss();
                    });
            });

        // 滚动同步方向（开关在预览面板工具栏）
        new Setting(containerEl)
            .setName('Scroll sync direction')
            .setDesc('Which side follows which. The toolbar button turns scrolling sync on and off.')
            .addDropdown(drop => {
                for (const mode of SYNC_MODES) {
                    drop.addOption(mode, SYNC_MODE_LABELS[mode]);
                }
                drop.setValue(this.plugin.settings.scrollSync);
                drop.onChange(value => {
                    void this.changeScrollSync(value as ScrollSyncMode);
                });
            });

        // 自定义主题管理
        new Setting(containerEl).setName('Custom themes').setHeading();
        const addRow = containerEl.createDiv({ cls: 'custom-theme-title-row' });
        const addBtn = addRow.createEl('button', { text: 'Add custom theme' });
        addBtn.onclick = () => {
            new CustomThemeModal(this.app, (name, css) => {
                void this.addCustomTheme(name, css);
            }).open();
        };

        // 列出现有自定义主题
        for (const name of Object.keys(this.plugin.settings.customThemes)) {
            const css = this.plugin.settings.customThemes[name];
            new Setting(containerEl)
                .setName(name)
                .addButton(btn => {
                    btn.setButtonText('Edit theme style').onClick(() => {
                        new CustomThemeModal(
                            this.app,
                            (newName, newCss) => {
                                void this.updateCustomTheme(name, newName, newCss);
                            },
                            name,
                            css,
                            true
                        ).open();
                    });
                })
                .addExtraButton(btn => {
                    btn.setIcon('trash')
                        .setTooltip('Delete')
                        .onClick(() => {
                            new ConfirmModal(this.app, `Delete the custom theme "${name}"?`, () => {
                                void this.deleteCustomTheme(name);
                            }).open();
                        });
                });
        }
    }

    /**
     * 切换当前主题并保存。
     */
    private async applyTheme(): Promise<void> {
        await this.plugin.saveSettings();
        await this.plugin.refreshAllThemeSelectors();
    }

    /**
     * 切换滚动同步模式并让所有预览面板立即生效。
     */
    private async changeScrollSync(mode: ScrollSyncMode): Promise<void> {
        this.plugin.settings.scrollSync = mode;
        await this.plugin.saveSettings();
        this.plugin.applyScrollSyncMode();
        new Notice(mode === 'off' ? 'Scroll sync off' : `Scroll sync on — ${SYNC_MODE_LABELS[mode]}`);
    }

    /**
     * 复制当前主题的 CSS 到剪贴板。
     */
    private async copyCurrentThemeCss(): Promise<void> {
        const current = this.plugin.settings.defaultTheme.toLowerCase();
        const theme = getAllThemes(this.plugin.settings).find(t => t.name.toLowerCase() === current);
        if (!theme) return;
        await navigator.clipboard.writeText(theme.css);
        new Notice('Theme CSS copied to clipboard');
    }

    /**
     * 新增自定义主题。
     */
    private async addCustomTheme(name: string, css: string): Promise<void> {
        if (!isThemeNameUnique(name, this.plugin.settings)) {
            new Notice('Theme name already exists');
            return;
        }
        this.plugin.settings.customThemes[name] = css;
        await this.plugin.saveSettings();
        await this.plugin.refreshAllThemeSelectors();
    }

    /**
     * 修改自定义主题（可同时改名）。
     */
    private async updateCustomTheme(oldName: string, newName: string, css: string): Promise<void> {
        if (!isThemeNameUnique(newName, this.plugin.settings, oldName)) {
            new Notice('Theme name already exists');
            return;
        }
        delete this.plugin.settings.customThemes[oldName];
        this.plugin.settings.customThemes[newName] = css;
        await this.plugin.saveSettings();
        await this.plugin.refreshAllThemeSelectors();
    }

    /**
     * 删除自定义主题；若删的是当前主题，回退到第一个内置主题。
     */
    private async deleteCustomTheme(name: string): Promise<void> {
        delete this.plugin.settings.customThemes[name];
        if (this.plugin.settings.defaultTheme.toLowerCase() === name.toLowerCase()) {
            const first = getAllThemes(this.plugin.settings)[0];
            this.plugin.settings.defaultTheme = first ? first.name : DEFAULT_SETTINGS.defaultTheme;
        }
        await this.plugin.saveSettings();
        await this.plugin.refreshAllThemeSelectors();
    }
}

/**
 * 通用确认弹窗，替代 window.confirm。
 */
class ConfirmModal extends Modal {
    private readonly message: string;
    private readonly onConfirm: () => void;

    constructor(app: App, message: string, onConfirm: () => void) {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.createEl('p', { text: this.message });
        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText('Delete')
                    .onClick(() => {
                        this.close();
                        this.onConfirm();
                    });
            })
            .addButton(btn => {
                btn.setButtonText('Cancel').onClick(() => {
                    this.close();
                });
            });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

/**
 * 自定义主题弹窗类，负责添加/编辑自定义主题。
 */
class CustomThemeModal extends Modal {
    private readonly onSubmit: (name: string, css: string) => void;
    private readonly initName: string;
    private readonly initCss: string;
    private readonly isEdit: boolean;

    constructor(
        app: App,
        onSubmit: (name: string, css: string) => void,
        initName = '',
        initCss = '',
        isEdit = false
    ) {
        super(app);
        this.onSubmit = onSubmit;
        this.initName = initName;
        this.initCss = initCss;
        this.isEdit = isEdit;
    }

    /**
     * 弹窗打开时渲染内容。
     */
    onOpen(): void {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: this.isEdit ? 'Modify custom theme' : 'Add custom theme' });

        let name = this.initName;
        let css = this.initCss;
        let nameInput: HTMLInputElement | null = null;
        let cssInput: HTMLTextAreaElement | null = null;

        new Setting(contentEl)
            .setName('Theme name')
            .addText(text => {
                nameInput = text.inputEl;
                text.setValue(this.initName);
                text.onChange(value => {
                    name = value;
                });
            });

        new Setting(contentEl)
            .setName('Theme CSS')
            .addTextArea(textarea => {
                cssInput = textarea.inputEl;
                textarea.setValue(this.initCss);
                textarea.inputEl.classList.add('theme-css-textarea');
                textarea.inputEl.rows = 8;
                textarea.onChange(value => {
                    css = value;
                });
            });

        new Setting(contentEl).addButton(btn =>
            btn.setButtonText(this.isEdit ? 'Save' : 'Add').onClick(() => {
                if (!name.trim()) {
                    nameInput?.focus();
                    new Notice('Theme name cannot be empty');
                    return;
                }
                if (!css.trim()) {
                    cssInput?.focus();
                    new Notice('Theme CSS cannot be empty');
                    return;
                }
                // 简单 css 校验：必须包含 { 和 }
                if (!/[{][^}]*[}]/.test(css)) {
                    cssInput?.focus();
                    new Notice('Please enter a valid CSS style');
                    return;
                }
                this.close();
                this.onSubmit(name.trim(), css);
            })
        );
    }

    /**
     * 弹窗关闭时清理内容。
     */
    onClose(): void {
        this.contentEl.empty();
    }
}
