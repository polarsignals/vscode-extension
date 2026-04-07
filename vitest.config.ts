import {defineConfig} from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, 'src/test/unit/mocks/vscode.ts'),
    },
  },
  test: {
    include: ['src/test/unit/**/*.test.ts'],
  },
});
