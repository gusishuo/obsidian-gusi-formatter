const fs = require('fs');
const path = require('path');

const themesDir = path.join(__dirname, '../themes');
const outFile = path.join(themesDir, 'index.ts');

const files = fs.readdirSync(themesDir)
  .filter(f => f.endsWith('.css'));

let imports = '';
let themeList = '';

files.forEach((file, idx) => {
  const varName = 'theme' + idx;
  imports += `import ${varName} from './${file}';\n`;
  const themeName = path.basename(file, '.css');
  themeList += `  { name: '${themeName}', css: ${varName} },\n`;
});

const content = `// 自动生成，勿手动修改
${imports}
export const builtinThemes = [
${themeList}
];
`;

fs.writeFileSync(outFile, content, 'utf8');
console.log('themes/index.ts 插件主题索引已生成');
