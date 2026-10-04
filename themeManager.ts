// 主题样式管理模块
// 负责加载、保存、获取默认主题和自定义主题

// @ts-ignore
import { Plugin } from 'obsidian';
// @ts-ignore
import { builtinThemes } from './themes';

/**
 * 主题管理器类，负责主题的保存、删除等操作。
 */
export class ThemeManager {
    plugin: any;
    defaultThemeName: string = 'default';

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    /**
     * 保存自定义主题。
     * @param pluginSettings 插件设置对象
     * @param themeName 主题名称
     * @param css 主题 CSS 内容
     */
    saveCustomTheme(pluginSettings: any, themeName: string, css: string) {
        pluginSettings.customThemes[themeName] = css;
    }

    /**
     * 删除自定义主题。
     * @param pluginSettings 插件设置对象
     * @param themeName 主题名称
     */
    deleteCustomTheme(pluginSettings: any, themeName: string) {
        delete pluginSettings.customThemes[themeName];
    }
}

/**
 * 主题元信息接口。
 */
export interface ThemeMeta {
    name: string;
    alias: string;
    description: string;
    css: string;
    file: string;
}

/**
 * 解析主题 CSS 文件头部注释，提取主题元信息（name、alias、description 等）。
 * @param css 主题 CSS 内容
 * @param file 文件名
 * @returns 主题元信息对象或 null
 */
function parseThemeMeta(css: string, file: string): ThemeMeta | null {
    const match = css.match(/\/\*([\s\S]*?)\*\//);
    if (!match) return null;
    const metaBlock = match[1];
    const meta: any = { file };
    for (const line of metaBlock.split('\n')) {
        const m = line.match(/\*?\s*(\w+):\s*(.+)/);
        if (m) meta[m[1].toLowerCase()] = m[2].trim();
    }
    if (!meta.name) return null;
    meta.css = css;
    return meta as ThemeMeta;
}

/**
 * 获取所有主题（内置+自定义），并补全元信息。
 * @param pluginSettings 插件设置对象
 * @returns 主题元信息数组
 */
export function getAllThemes(pluginSettings: any): ThemeMeta[] {
    // 解析自动生成的 builtinThemes，补全 alias/description/file 字段
    const builtin: ThemeMeta[] = (builtinThemes as any[]).map(t => {
        // t.name, t.css
        // 用 parseThemeMeta 解析 meta
        const meta = parseThemeMeta(t.css, t.name + '.css');
        if (meta) return meta;
        // 没有 meta 注释时兜底
        return {
            name: t.name,
            alias: t.name,
            description: '',
            css: t.css,
            file: t.name + '.css'
        };
    });
    const customThemes: ThemeMeta[] = Object.entries(pluginSettings.customThemes || {}).map(([name, css]) => ({
        name,
        alias: `Custom: ${name}`,
        description: '',
        css: css as string,
        file: ''
    }));
    return [...builtin, ...customThemes];
}

/**
 * 检查主题名是否唯一。
 * @param name 主题名称
 * @param pluginSettings 插件设置对象
 * @param oldName （可选）旧主题名称
 * @returns 是否唯一
 */
export function isThemeNameUnique(name: string, pluginSettings: any, oldName?: string): boolean {
    const allThemes = getAllThemes(pluginSettings);
    return !allThemes.some(t => t.name.toLowerCase() === name.toLowerCase() && t.name.toLowerCase() !== (oldName?.toLowerCase() || ''));
} 