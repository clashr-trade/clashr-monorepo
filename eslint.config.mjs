import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';

export default tseslint.config(
  { ignores: ['.claude/**', '**/node_modules', '**/.next', '**/.next-backup-*', '**/.open-next', '**/.wrangler', '**/dist', '**/*.d.ts'] },
  ...tseslint.configs.recommended,
  // Next 15 checks the config file itself for plugin registration.
  { plugins: { '@next/next': nextPlugin } },
  {
    files: ['apps/web/**/*.{ts,tsx,js,jsx}'],
    settings: { next: { rootDir: 'apps/web/' } },
    rules: {
      '@next/next/no-document-import-in-page': 'error',
      '@next/next/no-head-import-in-document': 'error',
      '@next/next/no-duplicate-head': 'error',
    },
  },
  { rules: { '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }] } },
);
