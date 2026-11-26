import { createRequire } from 'node:module';
import babelParser from '@babel/eslint-parser';
import type { ESLint } from 'eslint';
import { defineConfig } from 'eslint/config';

const require = createRequire(import.meta.url);
const stylex: ESLint.Plugin = require('@stylexjs/eslint-plugin');

export default defineConfig({
  files: ['src/renderer/**/*.{ts,tsx}'],
  languageOptions: {
    parser: babelParser,
    parserOptions: {
      requireConfigFile: false,
      babelOptions: {
        babelrc: false,
        configFile: false,
        parserOpts: { plugins: ['typescript', 'jsx'] },
      },
    },
  },
  plugins: { '@stylexjs': stylex },
  rules: {
    '@stylexjs/valid-styles': 'error',
    '@stylexjs/valid-shorthands': 'error',
    '@stylexjs/no-conflicting-props': 'error',
  },
});
