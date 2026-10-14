// Tiny TTL caches for hot reads (settings on every update, payment methods per country).
import { getSettings, type StoreSettings } from '@tokobun/core';
import { listPaymentMethods, type PaymentMethodInfo } from '@tokobun/payments';

export function ttlCache<K, V>(ttlMs: number, load: (key: K) => Promise<V>, maxSize = 1000) {
  const entries = new Map<K, { value: V; at: number }>();
  const inflight = new Map<K, Promise<V>>();
  return {
    async get(key: K): Promise<V> {
      const now = Date.now();
      const hit = entries.get(key);
      if (hit && now - hit.at < ttlMs) return hit.value;
      const pending = inflight.get(key);
      if (pending) return pending;
      const promise = load(key).then(
        (value) => {
          entries.set(key, { value, at: Date.now() });
          inflight.delete(key);
          if (entries.size > maxSize) {
            const cutoff = Date.now();
            for (const [k, e] of entries) if (cutoff - e.at > ttlMs) entries.delete(k);
            if (entries.size > maxSize) entries.delete(entries.keys().next().value!);
          }
          return value;
        },
        (err) => {
          inflight.delete(key);
          throw err;
        },
      );
      inflight.set(key, promise);
      return promise;
    },
    clear() {
      entries.clear();
    },
  };
}

const settingsCache = ttlCache<number, StoreSettings>(30_000, (storeId) => getSettings(storeId));
export const cachedSettings = (storeId: number) => settingsCache.get(storeId);

const methodsCache = ttlCache<string, PaymentMethodInfo[]>(60_000, (key) => {
  const [storeIdStr, purpose, country] = key.split('|') as [string, 'topup' | 'order', string];
  return listPaymentMethods({ storeId: Number(storeIdStr), purpose, country: country || null });
});
export const cachedMethods = (storeId: number, purpose: 'topup' | 'order', country: string | null) =>
  methodsCache.get(`${storeId}|${purpose}|${country ?? ''}`);

/** Country used to filter region-specific payment methods. */
export function countryOf(user: { language: string; currency: string }): string | null {
  return user.currency === 'IDR' || user.language === 'id' ? 'ID' : null;
}
