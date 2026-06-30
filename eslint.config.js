// Flat ESLint config. Focus: catch real bugs (undefined refs, obvious mistakes)
// without drowning a vanilla-JS codebase in stylistic noise — Prettier owns
// formatting (see eslint-config-prettier, applied last).

const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
  js.configs.recommended,

  // Server (Node / CommonJS)
  {
    files: ['server/**/*.js', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // Node scripts that also inject browser code via Puppeteer page.evaluate.
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-unused-vars': 'warn',
    },
  },

  // Browser (ES modules)
  {
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        // Injected at runtime by the server / third-party snippets.
        posthog: 'readonly',
        Sentry: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // Tests (Jest)
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.jest, ...globals.browser },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  {
    ignores: ['node_modules/**', 'public/**/*.min.js', '*.html', 'coverage/**'],
  },

  prettier,
];
