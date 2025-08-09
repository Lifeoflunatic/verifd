import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@verifd/shared': '/Users/harshilpatel/Desktop/Claude_Projects/verifd/packages/shared/dist/index.js'
    }
  }
});