import type { ScrollSyncMode } from './scrollSync';

/**
 * 插件设置结构。
 */
export interface Markdown2WechatHtmlSettings {
    defaultTheme: string;
    customThemes: { [key: string]: string };
    /** 编辑区与预览区的滚动同步模式 */
    scrollSync: ScrollSyncMode;
}
