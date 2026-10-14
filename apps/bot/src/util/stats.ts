import { getDb } from '@tokobun/db';

export interface StoreStats {
  users: number;
  usersToday: number;
  ordersToday: number;
  revenueToday: number;
  orders30: number;
  revenue30: number;
  topupsToday: number;
  topupAmountToday: number;
  supportOpen: number;
}

export async function storeStats(storeId: number): Promise<StoreStats> {
  const sql = getDb().$client;
  const [row] = await sql<Record<keyof StoreStats, string | number>[]>`
    select
      (select count(distinct u.id) from users u where exists (select 1 from orders o where o.user_id = u.id and o.store_id = ${storeId}) or exists (select 1 from payments p where p.user_id = u.id and p.store_id = ${storeId})) as users,
      (select count(distinct u.id) from users u where u.created_at >= date_trunc('day', now()) and (exists (select 1 from orders o where o.user_id = u.id and o.store_id = ${storeId}) or exists (select 1 from payments p where p.user_id = u.id and p.store_id = ${storeId}))) as "usersToday",
      (select count(*) from orders where store_id = ${storeId} and status = 'completed' and completed_at >= date_trunc('day', now())) as "ordersToday",
      (select coalesce(sum(total), 0) from orders where store_id = ${storeId} and status = 'completed' and completed_at >= date_trunc('day', now())) as "revenueToday",
      (select count(*) from orders where store_id = ${storeId} and status = 'completed' and completed_at >= now() - interval '30 days') as orders30,
      (select coalesce(sum(total), 0) from orders where store_id = ${storeId} and status = 'completed' and completed_at >= now() - interval '30 days') as revenue30,
      (select count(*) from payments where store_id = ${storeId} and purpose = 'topup' and status = 'paid' and paid_at >= date_trunc('day', now())) as "topupsToday",
      (select coalesce(sum(amount), 0) from payments where store_id = ${storeId} and purpose = 'topup' and status = 'paid' and paid_at >= date_trunc('day', now())) as "topupAmountToday",
      (select count(*) from support_sessions where store_id = ${storeId} and status = 'open') as "supportOpen"
  `;
  const out = {} as StoreStats;
  for (const [k, v] of Object.entries(row ?? {})) out[k as keyof StoreStats] = Number(v);
  return out;
}
