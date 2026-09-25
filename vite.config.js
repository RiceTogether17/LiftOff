import { defineConfig, loadEnv } from 'vite';
import { readFileSync, readdirSync } from 'node:fs';
import { encrypt } from './src/lock.js';

const VIRTUAL = 'virtual:locked-content';

/**
 * Bundles content/*.txt as an encrypted payload, so the published site never
 * contains the stories in readable form. The password comes from the
 * LIFTOFF_PASSWORD environment variable or a git-ignored .env file — it is
 * never committed.
 */
function lockedContent(password) {
  return {
    name: 'locked-content',
    resolveId: (id) => (id === VIRTUAL ? '\0' + VIRTUAL : null),
    async load(id) {
      if (id !== '\0' + VIRTUAL) return null;
      if (!password) {
        throw new Error(
          'LIFTOFF_PASSWORD is not set. Add it to a .env file (see .env.example) or the environment.',
        );
      }
      const dir = new URL('./content/', import.meta.url);
      const files = readdirSync(dir).filter((f) => f.endsWith('.txt'));
      for (const f of files) this.addWatchFile(new URL(f, dir).pathname);
      const texts = files.sort().map((f) => readFileSync(new URL(f, dir), 'utf8'));
      const payload = await encrypt(password, JSON.stringify(texts));
      return `export default ${JSON.stringify(payload)};`;
    },
  };
}

// Relative base so the build works from any folder (e.g. GitHub Pages).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    plugins: [lockedContent(env.LIFTOFF_PASSWORD)],
    test: { environment: 'node' },
  };
});
