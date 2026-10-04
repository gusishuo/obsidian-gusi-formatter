import type { Plugin } from 'obsidian';
import { builtinThemes } from './themes';
import type { Markdown2WechatHtmlSettings } from './types';

/**
 * 主题管理器类，负责主题的保存、删除等操作。
 */
export class ThemeManager {
    plugin: Plugin;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    /**
     * 保存自定义主题。
     */
    saveCustomTheme(pluginSettings: Markdown2WechatHtmlSettings, themeName: string, css: string): void {
        pluginSettings.customThemes[themeName] = css;
    }

    /**
     * 删除自定义主题。
     */
    deleteCustomTheme(pluginSettings: Markdown2WechatHtmlSettings, themeName: string): void {
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
 * 内置主题索引条目。
 */
interface BuiltinTheme {
    name: string;
    css: string;
}

/**
 * 解析主题 CSS 文件头部注释，提取主题元信息（name、alias、description 等）。
 */
function parseThemeMeta(css: string, file: string): ThemeMeta | null {
    const match = css.match(/\/\*([\s\S]*?)\*\//);
    if (!match) return null;
    const metaBlock = match[1];
    const fields: Record<string, string> = {};
    for (const line of metaBlock.split('\n')) {
        const m = line.match(/\*?\s*(\w+):\s*(.+)/);
        if (m) fields[m[1].toLowerCase()] = m[2].trim();
    }
    const name = fields.name;
    if (!name) return null;
    return {
        name,
        alias: fields.alias ?? name,
        description: fields.description ?? '',
        css,
        file,
    };
}

/**
 * 获取所有主题（内置+自定义），并补全元信息。
 */
export function getAllThemes(pluginSettings: Markdown2WechatHtmlSettings): ThemeMeta[] {
    const builtin: ThemeMeta[] = builtinThemes.map((t: BuiltinTheme) => {
        const file = `${t.name}.css`;
        const meta = parseThemeMeta(t.css, file);
        return meta ?? { name: t.name, alias: t.name, description: '', css: t.css, file };
    });
    const customThemes: ThemeMeta[] = Object.entries(pluginSettings.customThemes ?? {}).map(([name, css]) => ({
        name,
        alias: `Custom: ${name}`,
        description: '',
        css,
        file: '',
    }));
    return [...builtin, ...customThemes];
}

/**
 * 检查主题名是否唯一。
 */
export function isThemeNameUnique(
    name: string,
    pluginSettings: Markdown2WechatHtmlSettings,
    oldName?: string
): boolean {
    const target = name.toLowerCase();
    const skip = oldName?.toLowerCase() ?? '';
    return !getAllThemes(pluginSettings).some(
        t => t.name.toLowerCase() === target && t.name.toLowerCase() !== skip
    );
}
