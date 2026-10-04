declare module '*.css' {
  const content: string;
  export default content;
}
 
declare module 'markdown-it-katex' {
  import type { PluginSimple } from 'markdown-it';
  const markdownItKatex: PluginSimple;
  export default markdownItKatex;
} 