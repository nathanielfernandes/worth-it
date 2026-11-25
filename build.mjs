import * as esbuild from 'esbuild';
import { cp, rm } from 'node:fs/promises';

const watch = process.argv.includes('--watch');

await rm('dist', { recursive: true, force: true });
await cp('static', 'dist', { recursive: true });

const options = {
  entryPoints: {
    content: 'src/content/index.ts',
    background: 'src/background.ts',
    popup: 'src/popup/popup.ts',
  },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  // Unminified so the shipped code stays reviewable.
  minify: false,
  legalComments: 'none',
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
