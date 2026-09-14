import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.expo/**',
      '**/ios/**',
      '**/android/**',
      'apps/mobile/modules/plaud-sdk/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/mobile/**/*.tsx'],
    rules: { '@typescript-eslint/no-require-imports': ['error', { allow: ['\\.png$'] }] },
  },
  {
    files: [
      'apps/mobile/src/features/**/recorder-controller.ts',
      'apps/mobile/src/features/**/recorder-adapter.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['react', 'react-native', 'expo*', 'fastify', 'pg', '@aws-sdk/*'] },
      ],
    },
  },
);
