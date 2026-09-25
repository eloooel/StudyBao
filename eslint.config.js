import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * The constraints below are enforced here rather than merely documented, and each
 * error message names the fix. See CLAUDE.md "Hard constraints" and
 * docs/adr/0001-local-first-with-indexeddb.md.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'dev-dist/**', 'coverage/**', 'node_modules/**', '.npm-cache/**'],
  },

  tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.es2023 },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // --- Typing ---
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // --- Correctness that matters for data safety ---
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // --- Architecture: persistence and network access go through one place each ---
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'dexie',
              message:
                'Only src/db/ may import dexie. Feature code goes through a repository from @/db/repositories/ or a hook in src/db/. All IndexedDB access is centralised so migrations and sync have one audit point. See docs/ai/change-data-model.md and ADR 0001.',
            },
          ],
          patterns: [
            {
              group: ['firebase', 'firebase/*'],
              message:
                'Import from @/sync instead of firebase directly. Firestore access is centralised so the merge function and rules stay reviewable. See docs/adr/0001-local-first-with-indexeddb.md.',
            },
            {
              // Test infrastructure must never reach the bundle. Noticing it in a diff is not a
              // control: this makes it impossible to import a fake IndexedDB from production code,
              // and names the fix so the failure explains itself.
              group: ['fake-indexeddb', 'fake-indexeddb/*'],
              message:
                'fake-indexeddb is test-only and must not be imported by app code. Import it once in src/test/setup.ts, or use @/test/render in a test file. See docs/ai/write-tests.md.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'Use @/lib/api-client instead of raw fetch() in feature code, so failures surface in one place and every request is reviewable.',
        },
      ],
    },
  },

  // src/db/ IS the one place dexie may be imported — that is the whole point of the rule above.
  // The rule is not switched off wholesale here: it is restated with `dexie` dropped from `paths`,
  // because switching it off would also let `src/db/` import test infrastructure such as
  // fake-indexeddb, which is exactly the kind of leak this file exists to prevent.
  {
    files: ['src/db/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['firebase', 'firebase/*'],
              message:
                'Import from @/sync instead of firebase directly. Firestore access is centralised so the merge function and rules stay reviewable. See docs/adr/0001-local-first-with-indexeddb.md.',
            },
            {
              group: ['fake-indexeddb', 'fake-indexeddb/*'],
              message:
                'fake-indexeddb is test-only and must not be imported by app code, including src/db/. Import it once in src/test/setup.ts, or use @/test/render in a test file. See docs/ai/write-tests.md.',
            },
          ],
        },
      ],
    },
  },

  // The service worker registration is the one place a bare fetch-shaped global is fine.
  {
    files: ['src/lib/**/*.ts'],
    rules: {
      'no-restricted-globals': 'off',
    },
  },

  // Tests may reach for anything. Test helpers are not components, so the
  // fast-refresh rule has nothing to say about them.
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-globals': 'off',
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Config files run in Node, not the browser.
  {
    files: ['*.config.{ts,js,mjs}', '*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
)
