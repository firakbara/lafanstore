// Store shape that is safe to hand to pages and API responses (no bot token).
import type { StoreInfo } from '@tokobun/core';

export interface PublicStore {
	id: number;
	slug: string;
	name: string;
	botUsername: string | null;
	adminIds: number[];
	adminChatId: number | null;
	channelUrl: string | null;
	isActive: boolean;
}

export function toPublicStore(s: StoreInfo): PublicStore {
	return {
		id: s.id,
		slug: s.slug,
		name: s.name,
		botUsername: s.botUsername,
		adminIds: s.adminIds,
		adminChatId: s.adminChatId,
		channelUrl: s.channelUrl,
		isActive: s.isActive
	};
}
