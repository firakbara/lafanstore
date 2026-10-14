import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
	// The monorepo keeps a single .env at the repo root; SvelteKit would only look in apps/admin.
	// Load it into process.env (without overriding variables that are already set).
	const rootEnv = loadEnv(mode, repoRoot, '');
	for (const [k, v] of Object.entries(rootEnv)) if (process.env[k] === undefined) process.env[k] = v;

	return {
		plugins: [
			tailwindcss(),
			sveltekit({
				compilerOptions: {
					runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
				},
				adapter: adapter()
			})
		],
		// Workspace packages export raw .ts — let Vite transform them instead of externalizing.
		ssr: { noExternal: ['@tokobun/core', '@tokobun/db'] },
		// Pre-bundle client deps up front so the first navigation doesn't trigger a dep-optimizer reload.
		optimizeDeps: { include: ['@tanstack/svelte-query', '@tanstack/svelte-table', '@tanstack/svelte-form'] },
		server: { port: 5174, fs: { allow: [repoRoot] } }
	};
});
