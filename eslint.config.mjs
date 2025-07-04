import js from '@eslint/js';
import globals from 'globals';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import pluginReact from 'eslint-plugin-react';
import importPlugin from 'eslint-plugin-import';
import validateFilename from 'eslint-plugin-validate-filename';
import nextPlugin from '@next/eslint-plugin-next';

export default [
  {
    ignores: [
      'emails/',
      'prompt-engineering/',
      'supabase/',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        React: 'readonly',
        JSX: 'readonly',
      },
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      js,
      import: importPlugin,
      '@next/next': nextPlugin,
      'validate-filename': validateFilename,
      '@typescript-eslint': tsPlugin,
      react: pluginReact,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      ...pluginReact.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'no-undef': 'off', // TypeScript handles this better
    },
  },

  {
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    "rules": {
      "validate-filename/naming-rules": [
        "error",
        {
          rules: [
            {
              case: 'pascal', // camel or pascal or snake or kebab or flat
              target: "**/components/**", // target "components" folder
              excludes: ['hooks'], // "hooks" folder is excluded.
            },
            {
              case: 'kebab', // camel or pascal or snake or kebab or flat
              target: "**/lib/**", // target "lib" folder
              excludes: ['hooks'], // "hooks" folder is excluded.
            },
            {
              case: 'camel',
              target: "**/hooks/**", // target "hooks" folder
              patterns: '^use', // file names begin with "use".
            }
          ] 
        }
      ],
    },
  },
];
