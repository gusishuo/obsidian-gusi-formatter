import { App, Editor, MarkdownView } from 'obsidian';

/**
 * 滚动同步模式：
 * - `forward` 仅「编辑区 → 预览区」，最稳，不会来回抢滚动
 * - `both`    双向同步，预览滚动时编辑器会跳到对应行
 * - `off`     关闭
 */
export type ScrollSyncMode = 'both' | 'forward' | 'off';

export const SYNC_MODES: ScrollSyncMode[] = ['forward', 'both', 'off'];

export const SYNC_MODE_LABELS: Record<ScrollSyncMode, string> = {
    forward: 'Editor to preview only',
    both: 'Both directions',
    off: 'Off',
};

/** 开关按钮上显示的图标：开 = 联动链，关 = 断开的链 */
export const SYNC_ON_ICON = 'link';
export const SYNC_OFF_ICON = 'unlink';

export const SYNC_ON_LABEL = 'Scroll sync on';
export const SYNC_OFF_LABEL = 'Scroll sync off';

/** CodeMirror 6 视图上本插件实际用到的最小接口 */
interface CmViewLike {
    viewport: { from: number; to: number };
    scrollDOM: HTMLElement;
}

/** 一个滚动锚点：预览区顶层块级元素 + 它对应的源文件行号 */
interface Anchor {
    el: HTMLElement;
    line: number;
}

/**
 * 宿主接口：由预览面板实现，把 DOM 与设置交给同步控制器，
 * 避免两者互相直接引用。
 */
export interface ScrollSyncHost {
    app: App;
    getPreviewEl(): HTMLElement | null;
    getSyncMode(): ScrollSyncMode;
}

/** 程序化滚动后需要忽略的毫秒数，防止事件回环 */
const SUPPRESS_MS = 90;
/** 预览驱动的编辑器滚动，需要在一段时间内不再被预览反向拉动 */
const PREVIEW_DRIVEN_MS = 320;

/**
 * 取编辑器背后的 CodeMirror 6 视图。
 * obsidian 的类型定义没有暴露 `Editor.cm`，这里做最小结构断言。
 */
function getCmView(editor: Editor): CmViewLike | null {
    const cm: unknown = (editor as unknown as { cm?: unknown }).cm;
    if (!cm || typeof cm !== 'object') return null;
    const view = cm as Partial<CmViewLike>;
    if (!view.scrollDOM || !view.viewport) return null;
    return view as CmViewLike;
}

/**
 * 编辑区与预览区的滚动同步控制器。
 *
 * 实现思路：
 * 1. 转换 Markdown 时给每个顶层块级元素写入 `data-line`（源文件行号）。
 * 2. 编辑器滚动时，取视口顶部行号，找到预览区里最后一个「行号 ≤ 视口顶行」的块，
 *    把该块顶边对齐到预览视口顶边——按内容对齐，而不是按百分比。
 * 3. 反向同步同理，找到预览视口顶下方第一个块，让编辑器跳到对应行。
 * 4. 用时间窗屏蔽程序化滚动引发的事件回环。
 */
export class ScrollSyncController {
    private readonly host: ScrollSyncHost;
    private editorScrollEl: HTMLElement | null = null;
    private previewScrollEl: HTMLElement | null = null;
    private suppressEditorUntil = 0;
    private suppressPreviewUntil = 0;
    private previewDrivenUntil = 0;
    private frame: number | null = null;
    private job: (() => void) | null = null;

    constructor(host: ScrollSyncHost) {
        this.host = host;
    }

    /** 视图打开后调用：绑定两侧滚动监听 */
    attach(): void {
        this.bindEditorScroll();
        const previewEl = this.host.getPreviewEl();
        if (previewEl) {
            previewEl.addEventListener('scroll', this.onPreviewScroll, { passive: true });
            this.previewScrollEl = previewEl;
        }
    }

    /** 视图关闭时调用：解绑并取消挂起任务 */
    detach(): void {
        this.unbindEditorScroll();
        if (this.previewScrollEl) {
            this.previewScrollEl.removeEventListener('scroll', this.onPreviewScroll);
            this.previewScrollEl = null;
        }
        if (this.frame !== null) {
            window.cancelAnimationFrame(this.frame);
            this.frame = null;
        }
        this.job = null;
    }

    /** 切换文件或布局变化后调用：重新绑定编辑器滚动容器 */
    rebindEditor(): void {
        this.bindEditorScroll();
    }

    /** 模式变化后调用：关闭模式时解绑，打开时重新绑定 */
    applyMode(): void {
        if (this.host.getSyncMode() === 'off') {
            this.unbindEditorScroll();
        } else {
            this.bindEditorScroll();
        }
    }

    /** 同步是否处于开启状态（`off` 之外都算开） */
    isEnabled(): boolean {
        return this.host.getSyncMode() !== 'off';
    }

    /**
     * 把预览区对齐到编辑器当前滚动位置。
     * 渲染完内容、或初次打开面板时调用，让两侧立刻处于同一位置。
     */
    alignPreviewToEditor(): void {
        if (this.host.getSyncMode() === 'off') return;
        this.applyForward();
    }

    /** 记录预览区当前所在的源文件行号，供内容重渲染后恢复位置 */
    captureAnchorLine(): number | null {
        const anchors = this.collectAnchors();
        if (anchors.length === 0) return null;
        const previewEl = this.host.getPreviewEl();
        if (!previewEl) return null;
        const viewTop = previewEl.getBoundingClientRect().top;
        for (const anchor of anchors) {
            if (anchor.el.getBoundingClientRect().bottom > viewTop + 1) {
                return anchor.line;
            }
        }
        return anchors[anchors.length - 1].line;
    }

    /** 把预览区滚动到指定源文件行号 */
    alignPreviewToLine(line: number): void {
        const anchors = this.collectAnchors();
        if (anchors.length === 0) return;
        let target: Anchor | null = null;
        for (const anchor of anchors) {
            if (anchor.line <= line) target = anchor;
            else break;
        }
        if (!target) target = anchors[0];
        this.scrollPreviewToElement(target.el);
    }

    /** 编辑器滚动事件 */
    private readonly onEditorScroll = (): void => {
        const mode = this.host.getSyncMode();
        if (mode === 'off') return;
        const now = Date.now();
        if (this.suppressEditorUntil > now) return;
        if (this.previewDrivenUntil > now) return;
        this.schedule(() => {
            if (this.host.getSyncMode() === 'off') return;
            this.applyForward();
        });
    };

    /** 预览区滚动事件 */
    private readonly onPreviewScroll = (): void => {
        if (this.host.getSyncMode() !== 'both') return;
        const now = Date.now();
        if (this.suppressPreviewUntil > now) return;
        this.previewDrivenUntil = now + PREVIEW_DRIVEN_MS;
        this.schedule(() => {
            if (this.host.getSyncMode() !== 'both') return;
            this.applyReverse();
        });
    };

    /**
     * 收集预览区的行号锚点。
     * 只取 `section` 下的顶层块级元素，保证对齐的是块顶边而不是块内某个内联标签。
     */
    private collectAnchors(): Anchor[] {
        const previewEl = this.host.getPreviewEl();
        if (!previewEl) return [];
        const content = previewEl.querySelector<HTMLElement>('.wechat-html-content');
        if (!content) return [];
        const root = content.querySelector<HTMLElement>('#markdown2wechathtml') ?? content;
        const anchors: Anchor[] = [];
        for (const child of Array.from(root.children)) {
            const el = child as HTMLElement;
            if (el.tagName === 'HR') {
                // 分隔线高度为 0，无法用 getBoundingClientRect 对齐，跳过
                continue;
            }
            const line = this.resolveLineOf(el);
            if (line !== null) anchors.push({ el, line });
        }
        return anchors;
    }

    /** 取一个块级元素对应的源文件行号；代码块的 data-line 落在内部 code 上，取后代最小值 */
    private resolveLineOf(el: HTMLElement): number | null {
        const own = el.getAttribute('data-line');
        if (own !== null) {
            const value = Number(own);
            if (Number.isFinite(value)) return value;
        }
        let found: number | null = null;
        for (const inner of Array.from(el.querySelectorAll('[data-line]'))) {
            const value = Number(inner.getAttribute('data-line'));
            if (Number.isFinite(value) && (found === null || value < found)) found = value;
        }
        return found;
    }

    /** 找到当前活动（或最近使用的）Markdown 编辑器 */
    private getActiveEditor(): Editor | null {
        const workspace = this.host.app.workspace;
        // 焦点在预览面板时 activeLeaf 不是 MarkdownView，所以先试最近使用的叶子
        const recent = workspace.getMostRecentLeaf();
        if (recent && recent.view instanceof MarkdownView) {
            return recent.view.editor;
        }
        // 退而求其次：找当前可见区域里的第一个 Markdown 视图
        let result: Editor | null = null;
        workspace.iterateAllLeaves(leaf => {
            if (result === null && leaf.view instanceof MarkdownView) {
                result = leaf.view.editor;
            }
        });
        return result;
    }

    /** 编辑器 → 预览 */
    private applyForward(): void {
        const previewEl = this.host.getPreviewEl();
        const editor = this.getActiveEditor();
        if (!previewEl || !editor) return;
        const cm = getCmView(editor);
        const anchors = this.collectAnchors();
        if (anchors.length === 0) return;
        if (!cm) {
            this.syncByRatio(cmScrollFallback(editor), previewEl);
            return;
        }
        const topLine = cm.viewport.from;
        let target: Anchor | null = null;
        for (const anchor of anchors) {
            if (anchor.line <= topLine) target = anchor;
            else break;
        }
        if (!target) target = anchors[0];
        this.scrollPreviewToElement(target.el);
    }

    /** 预览 → 编辑器 */
    private applyReverse(): void {
        const previewEl = this.host.getPreviewEl();
        const editor = this.getActiveEditor();
        if (!previewEl || !editor) return;
        const cm = getCmView(editor);
        if (!cm) return;
        const anchors = this.collectAnchors();
        if (anchors.length === 0) return;
        const viewTop = previewEl.getBoundingClientRect().top;
        let line: number | null = null;
        for (const anchor of anchors) {
            if (anchor.el.getBoundingClientRect().top > viewTop + 1) {
                line = anchor.line;
                break;
            }
        }
        if (line === null) {
            const last = anchors[anchors.length - 1];
            const lastBottom = last.el.getBoundingClientRect().bottom;
            if (lastBottom < viewTop) line = last.line;
        }
        if (line === null) return;
        // 目标行已经在编辑器视口内就不动，避免细微抖动
        if (line >= cm.viewport.from && line < cm.viewport.to) return;
        this.suppressEditorUntil = Date.now() + SUPPRESS_MS;
        editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
    }

    /** 拿不到 CodeMirror 视图时的兜底：按可滚动高度比例同步 */
    private syncByRatio(source: HTMLElement | null, previewEl: HTMLElement): void {
        if (!source) return;
        const sourceRange = source.scrollHeight - source.clientHeight;
        const previewRange = previewEl.scrollHeight - previewEl.clientHeight;
        if (sourceRange <= 0 || previewRange <= 0) return;
        this.suppressPreviewUntil = Date.now() + SUPPRESS_MS;
        previewEl.scrollTop = (source.scrollTop / sourceRange) * previewRange;
    }

    /** 把预览区滚到某个元素顶部对齐，并屏蔽随之而来的 scroll 事件 */
    private scrollPreviewToElement(el: HTMLElement): void {
        const previewEl = this.host.getPreviewEl();
        if (!previewEl) return;
        const delta = el.getBoundingClientRect().top - previewEl.getBoundingClientRect().top;
        if (Math.abs(delta) < 1) return;
        this.suppressPreviewUntil = Date.now() + SUPPRESS_MS;
        previewEl.scrollTop = previewEl.scrollTop + delta;
    }

    /** 绑定编辑器滚动容器（切换文件或布局变化后需要重绑） */
    private bindEditorScroll(): void {
        this.unbindEditorScroll();
        if (this.host.getSyncMode() === 'off') return;
        const editor = this.getActiveEditor();
        if (!editor) return;
        const scrollDOM = getCmView(editor)?.scrollDOM;
        if (!scrollDOM) return;
        scrollDOM.addEventListener('scroll', this.onEditorScroll, { passive: true });
        this.editorScrollEl = scrollDOM;
    }

    private unbindEditorScroll(): void {
        if (this.editorScrollEl) {
            this.editorScrollEl.removeEventListener('scroll', this.onEditorScroll);
            this.editorScrollEl = null;
        }
    }

    /** 同一帧内只执行一次同步 */
    private schedule(job: () => void): void {
        this.job = job;
        if (this.frame !== null) return;
        this.frame = window.requestAnimationFrame(() => {
            this.frame = null;
            const run = this.job;
            this.job = null;
            run?.();
        });
    }
}

/** 拿不到 CodeMirror 6 视图时，尝试用编辑器所在视图的滚动容器兜底 */
function cmScrollFallback(editor: Editor): HTMLElement | null {
    const owner = (editor as unknown as { cm?: { dom?: HTMLElement } }).cm;
    return owner?.dom ?? null;
}
