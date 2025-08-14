import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [],
    testTimeout: 30000, // 30 second timeout
    // Only include our test files
    include: process.env.RUN_DB_E2E === '1' || process.env.USE_SQLJS_FOR_TESTS === '1'
      ? ['test/**/*.test.ts']
      : ['test/**/*.simple.test.ts', 'test/**/*.mock.test.ts'],
    // Exclude node_modules and other directories
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '.git/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/test/**',
        '**/tests/**',
        'src/server-mock.ts',
        'src/db/mock.ts',
        'src/db/pure-mock.ts',
        'src/db/index-mock.ts',
        'src/routes/test-helpers.ts'
      ],
      thresholds: {
        lines: 40,
        functions: 35,
        branches: 30,
        statements: 40
      }
    }
  },
  resolve: {
    alias: {
      '@verifd/shared': '/Users/harshilpatel/Desktop/Claude_Projects/verifd/packages/shared/dist/index.js'
    }
  }
});