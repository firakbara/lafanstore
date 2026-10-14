<script lang="ts">
	// Renders Telegram-HTML (b, i, u, s, a, code, pre, tg-spoiler, blockquote) safely: everything else is escaped.
	let { title = null, html, label = 'Preview' }: { title?: string | null; html: string; label?: string } = $props();

	const ALLOWED = new Set(['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'code', 'pre', 'tg-spoiler', 'blockquote', 'a', 'span', 'tg-emoji']);

	function escape(s: string) {
		return s.replace(/&(?!(amp|lt|gt|quot|#\d+|#x[\da-fA-F]+);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	function render(src: string): string {
		let out = '';
		let last = 0;
		const re = /<(\/?)([a-zA-Z-]+)((?:\s+[a-zA-Z-]+="[^"]*")*)\s*>/g;
		let m: RegExpExecArray | null;
		while ((m = re.exec(src))) {
			out += escape(src.slice(last, m.index));
			last = re.lastIndex;
			const [, close, rawTag, attrs] = m;
			const tag = rawTag!.toLowerCase();
			if (!ALLOWED.has(tag)) {
				out += escape(m[0]);
				continue;
			}
			const map: Record<string, string> = { 'tg-spoiler': 'span', 'tg-emoji': 'span', strong: 'b', em: 'i', ins: 'u', strike: 's', del: 's' };
			const t = map[tag] ?? tag;
			if (close) {
				out += `</${t}>`;
				continue;
			}
			if (tag === 'a') {
				const href = /href="([^"]*)"/.exec(attrs ?? '')?.[1] ?? '';
				const safe = /^(https?:|tg:)/i.test(href) ? href.replace(/"/g, '&quot;') : '#';
				out += `<a href="${safe}" target="_blank" rel="noopener noreferrer">`;
			} else if (tag === 'tg-spoiler' || (tag === 'span' && /tg-spoiler/.test(attrs ?? ''))) {
				out += '<span class="tg-spoiler">';
			} else out += `<${t}>`;
		}
		out += escape(src.slice(last));
		return out.replace(/\n/g, '<br>');
	}

	const rendered = $derived(render(html));
</script>

<div>
	<div class="label">{label}</div>
	<div class="rounded-lg bg-[#e6ebee] p-3 dark:bg-[#0e1621]">
		<div class="tg-bubble max-w-[420px] rounded-xl rounded-bl-sm bg-white px-3 py-2 text-[14px] leading-snug text-[#000] shadow-sm dark:bg-[#182533] dark:text-[#f5f5f5]">
			{#if title}<div class="mb-1 font-bold">{title}</div>{/if}
			{#if html.trim()}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by render() above -->
				{@html rendered}
			{:else}
				<span class="text-muted italic">Nothing to preview</span>
			{/if}
		</div>
	</div>
</div>

<style>
	.tg-bubble :global(a) {
		color: #168acd;
	}
	.tg-bubble :global(code),
	.tg-bubble :global(pre) {
		font-family: var(--font-mono);
		font-size: 12.5px;
		color: #c7254e;
	}
	.tg-bubble :global(pre) {
		white-space: pre-wrap;
		background: rgba(0, 0, 0, 0.05);
		padding: 6px;
		border-radius: 6px;
	}
	.tg-bubble :global(blockquote) {
		border-left: 3px solid #168acd;
		padding-left: 8px;
		margin: 4px 0;
	}
	.tg-bubble :global(.tg-spoiler) {
		background: rgba(0, 0, 0, 0.25);
		border-radius: 3px;
		color: transparent;
		transition: color 0.2s;
	}
	.tg-bubble :global(.tg-spoiler:hover) {
		color: inherit;
		background: transparent;
	}
</style>
