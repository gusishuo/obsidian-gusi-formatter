// @ts-ignore
import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, Modal } from 'obsidian';
import { ThemeManager, ThemeMeta, getAllThemes, isThemeNameUnique } from './themeManager';
import { WechatHtmlPreviewView, VIEW_TYPE_WECHAT_PREVIEW, RIBBON_ICON_TEXT} from './previewPane';

// 插件设置接口
interface Markdown2WechatHtmlSettings {
    defaultTheme: string;
    customThemes: { [key: string]: string };
}

// 默认设置
const DEFAULT_SETTINGS: Markdown2WechatHtmlSettings = {
    defaultTheme: 'default',
    customThemes: {},
};

/**
 * 插件主类，负责插件生命周期、设置加载保存、主题管理、样式注入等。
 */
export default class Markdown2WechatHtmlPlugin extends Plugin {
    settings!: Markdown2WechatHtmlSettings;
    themeManager!: ThemeManager;
    settingTab!: Markdown2WechatHtmlSettingTab;

    /**
     * 插件加载时自动调用，初始化设置、主题、视图、样式等。
     */
    async onload() {
        const css = await this.loadStylesCss();
        const styleEl = document.createElement('style');
        styleEl.textContent = css;
        document.head.appendChild(styleEl);
        this.register(() => styleEl.remove());
        // 加载用户设置
        await this.loadSettings();
        this.themeManager = new ThemeManager(this);
        // 注册设置页
        this.settingTab = new Markdown2WechatHtmlSettingTab(this);
        // @ts-ignore
        this.addSettingTab(this.settingTab);
        // 注册右侧预览面板
        // @ts-ignore
        this.registerView(
            VIEW_TYPE_WECHAT_PREVIEW,
            (leaf: WorkspaceLeaf) => new WechatHtmlPreviewView(leaf, this)
        );
        // 注册功能区icon
        // @ts-ignore
        this.addRibbonIcon('eye', RIBBON_ICON_TEXT, async () => {
            // 若已打开则关闭，否则打开
            // @ts-ignore
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_WECHAT_PREVIEW);
            if (leaves.length > 0) {
                // @ts-ignore
                this.app.workspace.detachLeavesOfType(VIEW_TYPE_WECHAT_PREVIEW);
            } else {
                await this.activatePreviewView();
            }
        });
    }

    /**
     * 激活右侧预览面板。
     */
    async activatePreviewView() {
        // @ts-ignore
        await this.app.workspace.getRightLeaf(false).setViewState({
            type: VIEW_TYPE_WECHAT_PREVIEW,
            active: true,
        });
        // @ts-ignore
        this.app.workspace.revealLeaf(
            this.app.workspace.getLeavesOfType(VIEW_TYPE_WECHAT_PREVIEW)[0]
        );
    }

    /**
     * 插件卸载时自动调用，清理预览面板。
     */
    onunload() {
        // 卸载时关闭所有预览面板
        // @ts-ignore
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_WECHAT_PREVIEW);
    }

    /**
     * 加载插件设置。
     */
    async loadSettings() {
        // @ts-ignore
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    /**
     * 保存插件设置。
     */
    async saveSettings() {
        // @ts-ignore
        await this.saveData(this.settings);
    }

    /**
     * 刷新所有主题选择器（预览页和设置页）。
     */
    async refreshAllThemeSelectors() {
        // 刷新所有预览页
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_WECHAT_PREVIEW);
        for (const leaf of leaves) {
            const view = leaf.view as any;
            if (view && view.renderToolbar) {
                await view.renderToolbar();
            }
        }
        // 刷新设置页
        if (this.settingTab && this.settingTab.display) {
            this.settingTab.display();
        }
    }

    /**
     * 读取 styles.css 文件内容并注入页面。
     */
    async loadStylesCss() {
        // @ts-ignore
        return await this.app.vault.adapter.read(this.manifest.dir + '/styles.css');
    }
}

/**
 * 插件设置页类，负责渲染设置 UI、主题管理 UI。
 */
class Markdown2WechatHtmlSettingTab extends PluginSettingTab {
    plugin: Markdown2WechatHtmlPlugin;
    themeManager: ThemeManager;
    selectedThemeMeta: ThemeMeta | null = null;

    constructor(plugin: Markdown2WechatHtmlPlugin) {
        // @ts-ignore
        super((plugin as any).app, plugin);
        this.plugin = plugin;
        this.themeManager = plugin.themeManager;
    }

    /**
     * 渲染设置页内容。
     */
    display(): void {
        // @ts-ignore
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Convert Markdown to Html Plugin Settings' });
        // 操作说明
        containerEl.createEl('p', { text: 'Convert the current Markdown document to WeChat rich text HTML in real time, preview on the right, and copy with one click. Custom theme styles are supported.' });
        // 当前主题选择
        new Setting(containerEl)
            .setName('Current Theme')
            .setDesc('Select the theme style to use for preview')
            .addDropdown((drop: any) => {
                drop.selectEl.innerHTML = '';
                const allThemes = getAllThemes(this.plugin.settings);
                for (const theme of allThemes) {
                    drop.addOption(theme.name, theme.name);
                }
                drop.setValue(this.plugin.settings.defaultTheme);
                drop.onChange(async (value: any) => {
                    this.plugin.settings.defaultTheme = value;
                    await this.plugin.saveSettings();
                    await this.plugin.refreshAllThemeSelectors();
                });
            })
            .addExtraButton((btn: any) => {
                btn.setIcon('copy').setTooltip('Copy current theme CSS').onClick(async () => {
                    const allThemes = getAllThemes(this.plugin.settings);
                    const theme = allThemes.find(t => t.name.toLowerCase() === this.plugin.settings.defaultTheme.toLowerCase());
                    if (theme) {
                        await navigator.clipboard.writeText(theme.css);
                        // @ts-ignore
                        new window.Notice('Theme CSS copied to clipboard');
                    }
                });
            });
        // 自定义主题管理标题及添加按钮
        const customTitleDiv = containerEl.createDiv({ cls: 'custom-theme-title-row', text: '' });
        customTitleDiv.createEl('h3', { text: 'Custom Theme Management' });
        const addBtn = customTitleDiv.createEl('button', { text: 'Add Custom Theme' });
        addBtn.onclick = () => {
            new CustomThemeModal(this.app, async (name, css) => {
                if (!name || !css) return;
                if (!isThemeNameUnique(name, this.plugin.settings)) {
                    // @ts-ignore
                    new window.Notice('Theme name already exists');
                    return;
                }
                this.plugin.settings.customThemes[name] = css;
                await this.plugin.saveSettings();
                await this.plugin.refreshAllThemeSelectors();
            }).open();
        };
        // 列出现有自定义主题
        for (const name in this.plugin.settings.customThemes) {
            const css = this.plugin.settings.customThemes[name];
            const row = new Setting(containerEl)
                .setName(name)
                .addButton((btn: any) => {
                    btn.setButtonText('Edit Theme Style').onClick(() => {
                        new CustomThemeModal(this.app, async (newName, newCss) => {
                            if (!newName || !newCss) return;
                            if (!isThemeNameUnique(newName, this.plugin.settings, name)) {
                                // @ts-ignore
                                new window.Notice('Theme name already exists');
                                return;
                            }
                            delete this.plugin.settings.customThemes[name];
                            this.plugin.settings.customThemes[newName] = newCss;
                            await this.plugin.saveSettings();
                            await this.plugin.refreshAllThemeSelectors();
                        }, name, css, true).open();
                    });
                })
                .addExtraButton((btn: any) => {
                    btn.setIcon('cross').setTooltip('Delete').onClick(async () => {
                        if (window.confirm(`Are you sure you want to delete the custom theme "${name}"?`)) {
                            delete this.plugin.settings.customThemes[name];
                            // 如果当前主题被删，切换为默认主题
                            if (this.plugin.settings.defaultTheme.toLowerCase() === name.toLowerCase()) {
                                const firstBuiltin = getAllThemes(this.plugin.settings)[0]?.name || '';
                                this.plugin.settings.defaultTheme = firstBuiltin;
                                await this.plugin.saveSettings();
                            }
                            await this.plugin.saveSettings();
                            await this.plugin.refreshAllThemeSelectors();
                        }
                    });
                });
        }
    }
}

/**
 * 自定义主题弹窗类，负责添加/编辑自定义主题。
 */
class CustomThemeModal extends Modal {
    onSubmit: (name: string, css: string) => void;
    initName: string;
    initCss: string;
    isEdit: boolean;
    constructor(app: App, onSubmit: (name: string, css: string) => void, initName = '', initCss = '', isEdit = false) {
        super(app);
        this.onSubmit = onSubmit;
        this.initName = initName;
        this.initCss = initCss;
        this.isEdit = isEdit;
    }
    /**
     * 弹窗打开时渲染内容。
     */
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: this.isEdit ? 'Modify Custom Theme' : 'Add Custom Theme' });
        let name = this.initName;
        let css = this.initCss;
        let nameInput: HTMLInputElement;
        let cssInput: HTMLTextAreaElement;
        new Setting(contentEl)
            .setName('Theme Name')
            .addText(text => {
                nameInput = text.inputEl;
                text.setValue(this.initName);
                text.onChange(value => name = value);
            });
        new Setting(contentEl)
            .setName('Theme CSS')
            .addTextArea(textarea => {
                cssInput = textarea.inputEl;
                textarea.setValue(this.initCss);
                textarea.inputEl.classList.add('theme-css-textarea');
                textarea.inputEl.rows = 8;
                textarea.onChange(value => css = value);
            });
        new Setting(contentEl)
            .addButton(btn => btn.setButtonText(this.isEdit ? 'Save' : 'Add').onClick(() => {
                if (!name.trim()) {
                    nameInput.focus();
                    // @ts-ignore
                    new window.Notice('Theme name cannot be empty');
                    return;
                }
                if (!css.trim()) {
                    cssInput.focus();
                    // @ts-ignore
                    new window.Notice('Theme CSS cannot be empty');
                    return;
                }
                // 简单css校验：必须包含{和}
                if (!/[{][^}]*[}]/.test(css)) {
                    cssInput.focus();
                    // @ts-ignore
                    new window.Notice('Please enter a valid CSS style');
                    return;
                }
                this.close();
                this.onSubmit(name.trim(), css);
            }));
    }
    /**
     * 弹窗关闭时清理内容。
     */
    onClose() {
        this.contentEl.empty();
    }
} 