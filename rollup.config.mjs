import typescript from 'rollup-plugin-typescript2';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import postcss from 'rollup-plugin-postcss';
import copy from 'rollup-plugin-copy';

export default {
  input: 'main.ts',
  output: {
    dir: 'dist/gusi-formatter',
    format: 'cjs',
    entryFileNames: 'main.js',
    exports: 'default'
  },
  plugins: [
    nodeResolve(),
    commonjs(),
    json(),
    postcss({
      inject: false,
      extract: false,
      modules: false,
      minimize: false,
    }),
    typescript({ tsconfig: './tsconfig.json' }),
    copy({
      targets: [
        { src: 'styles.css', dest: 'dist/gusi-formatter' },
        { src: 'manifest.json', dest: 'dist/gusi-formatter' }
      ]
    })
  ],
  external: ['obsidian']
}; 