// Demo catalog + default settings. Run: `bun run seed` (from packages/core) or `bun run db:seed` (root).
// Replaces the catalog (products, discounts, stock, vouchers) and writes default settings.
// Refuses when orders exist unless --force (which TRUNCATEs with CASCADE, wiping orders/payments too).
import { randomBytes } from 'node:crypto';
import { getDb, orders, productDiscounts, products, stockItems, stores, vouchers } from '@tokobun/db';
import { count, eq, sql } from 'drizzle-orm';
import { loadRootEnv } from './env';

loadRootEnv();

const { generateProductCode, updateSettings, createStore } = await import('./index');

type StockGen = (i: number) => string;
interface SeedProduct {
  name: string;
  icon: string;
  price: number; // cents
  stock?: number; // number of stock rows (0 = sold out)
  gen?: StockGen;
  unlimited?: string; // unlimited content
  warranty?: string;
  note?: string;
  discounts?: { minQty: number; percentBp: number }[];
  variants?: SeedProduct[];
}

const hex = (n: number) => randomBytes(n).toString('hex');
const alnum = (n: number) =>
  Array.from(randomBytes(n), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
const winKey = () => Array.from({ length: 5 }, () => alnum(5)).join('-');
const account = (domain: string) => (i: number) => `user${1000 + i}.${hex(2)}@${domain} | Pw-${alnum(10)}`;
const link = (base: string) => () => `${base}${hex(8)}`;

const catalog: SeedProduct[] = [
  {
    name: 'Gemini Pro Family Plan (link invite)',
    icon: '✨',
    price: 250,
    stock: 30,
    gen: link('https://one.google.com/join/ai-pro/'),
    warranty: '30d',
    note: 'Open the link with a <b>fresh Google account</b>. Invite valid 24h after delivery.',
    discounts: [
      { minQty: 10, percentBp: 300 },
      { minQty: 150, percentBp: 600 },
    ],
  },
  {
    name: 'Office 365 Lifetime',
    icon: '📊',
    price: 450,
    stock: 18,
    gen: account('o365.example'),
    warranty: '90d',
    note: 'Login at <code>office.com</code>. Do not change the recovery email.',
  },
  {
    name: 'CapCut Pro 1 Month',
    icon: '🎬',
    price: 120,
    stock: 40,
    gen: account('capcut.example'),
    warranty: '25d',
    discounts: [{ minQty: 20, percentBp: 500 }],
  },
  {
    name: 'Spotify Premium 3 Month',
    icon: '🎧',
    price: 300,
    stock: 25,
    gen: account('spotify.example'),
    warranty: '80d',
    note: 'Individual plan. Region: ID. Do not change country.',
  },
  {
    name: 'NordVPN 3 Month',
    icon: '🛡️',
    price: 280,
    stock: 12,
    gen: account('nordvpn.example'),
    warranty: '80d',
  },
  {
    name: 'Canva Edu Pro (invite)',
    icon: '🎨',
    price: 50,
    unlimited: 'https://www.canva.com/brand/join?token=DEMO-EDU-INVITE&referrer=team-invite',
    note: 'Unlimited stock — same team invite link for everyone. Valid until the end of the school year.',
  },
  {
    name: 'Windows 10/11 Pro Key',
    icon: '🪟',
    price: 150,
    stock: 50,
    gen: winKey,
    warranty: 'lifetime',
    note: 'Retail key. Activate via <code>Settings → Activation</code>.',
    discounts: [
      { minQty: 5, percentBp: 500 },
      { minQty: 20, percentBp: 1000 },
    ],
  },
  {
    name: 'Claude API Plans',
    icon: '🤖',
    price: 0,
    note: 'API credit accounts. Pick a variant.',
    variants: [
      {
        name: 'Claude API $5 credit',
        icon: '🤖',
        price: 400,
        stock: 15,
        gen: (i) => `sk-ant-demo-${hex(12)} | org-${1000 + i}`,
        warranty: '10d',
      },
      {
        name: 'Claude API $25 credit',
        icon: '🤖',
        price: 1800,
        stock: 6,
        gen: (i) => `sk-ant-demo-${hex(12)} | org-${2000 + i}`,
        warranty: '10d',
        discounts: [{ minQty: 5, percentBp: 400 }],
      },
    ],
  },
  { name: 'ChatGPT Plus 1 Month (shared)', icon: '💬', price: 350, stock: 20, gen: account('chatgpt.example'), warranty: '25d' },
  { name: 'Netflix Premium 1 Month (1 profile)', icon: '🍿', price: 200, stock: 22, gen: account('netflix.example'), warranty: '28d' },
  { name: 'YouTube Premium 1 Month (invite)', icon: '▶️', price: 100, stock: 35, gen: link('https://families.google.com/join/yt/'), warranty: '28d' },
  { name: 'Duolingo Super 12 Month', icon: '🦉', price: 220, stock: 10, gen: account('duolingo.example'), warranty: '180d' },
  { name: 'Grammarly Premium 1 Month', icon: '✍️', price: 150, stock: 0, gen: account('grammarly.example') },
  { name: 'Adobe Creative Cloud 1 Month', icon: '🅰️', price: 600, stock: 0, gen: account('adobe.example'), warranty: '25d' },
  { name: 'Disney+ Hotstar 1 Month', icon: '🏰', price: 160, stock: 0, gen: account('hotstar.example') },
  { name: 'Perplexity Pro 12 Month', icon: '🔎', price: 900, stock: 8, gen: (i) => `PPLX-${alnum(16)}-${i}`, warranty: '30d' },
  { name: 'Steam Wallet $10', icon: '🎮', price: 1050, stock: 14, gen: () => `${alnum(5)}-${alnum(5)}-${alnum(5)}` },
  { name: 'Google Play Gift Card $5', icon: '🎁', price: 530, stock: 9, gen: () => alnum(16) },
  { name: 'Express VPN 1 Month', icon: '🌐', price: 180, stock: 5, gen: account('expressvpn.example'), warranty: '25d' },
  {
    name: 'Bitdefender Total Security 1 Year',
    icon: '🦠',
    price: 400,
    stock: 11,
    gen: () => `${alnum(6)}-${alnum(4)}-${alnum(4)}`,
    warranty: '365d',
    discounts: [{ minQty: 3, percentBp: 500 }],
  },
];

const db = getDb();
const force = process.argv.includes('--force');
const [{ n: orderCount } = { n: 0 }] = await db.select({ n: count() }).from(orders);
if (Number(orderCount) > 0 && !force) {
  console.error(`seed: ${orderCount} orders exist; re-run with --force to wipe the catalog (cascades into orders/payments).`);
  process.exit(1);
}

if (force) {
  await db.execute(sql`truncate table stock_items, product_discounts, voucher_redemptions, vouchers, products restart identity cascade`);
} else {
  await db.transaction(async (t) => {
    await t.delete(stockItems);
    await t.delete(productDiscounts);
    await t.execute(sql`delete from voucher_redemptions`);
    await t.delete(vouchers);
    await t.execute(sql`update products set parent_id = null`);
    await t.delete(products);
  });
}

// Ensure a default store exists
const [existingStore] = await db.select().from(stores).where(eq(stores.slug, 'default')).limit(1);
const storeId = existingStore?.id ?? (await createStore({
  slug: 'default',
  name: process.env.STORE_NAME || 'TokoLafan',
  botToken: process.env.BOT_TOKEN || 'placeholder',
  botUsername: process.env.BOT_USERNAME?.replace(/^@/, '') || null,
  adminIds: (process.env.ADMIN_IDS ?? '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isSafeInteger(n) && n > 0),
  adminChatId: process.env.ADMIN_CHAT_ID ? Number(process.env.ADMIN_CHAT_ID) : null,
  channelUrl: process.env.CHANNEL_URL || null,
})).id;

let sortOrder = 0;
let stockRows = 0;
async function insertProduct(p: SeedProduct, parentId: number | null): Promise<void> {
  const [row] = await db
    .insert(products)
    .values({
      storeId,
      code: generateProductCode(),
      parentId,
      isCollection: !!p.variants,
      name: p.name,
      icon: p.icon,
      price: p.price,
      warranty: p.warranty ?? null,
      note: p.note ?? null,
      unlimited: !!p.unlimited,
      unlimitedContent: p.unlimited ?? null,
      sortOrder: sortOrder++,
    })
    .returning({ id: products.id });
  const id = row!.id;
  for (const d of p.discounts ?? []) await db.insert(productDiscounts).values({ productId: id, ...d });
  const n = p.stock ?? 0;
  if (n > 0 && p.gen) {
    const gen = p.gen;
    await db.insert(stockItems).values(Array.from({ length: n }, (_, i) => ({ productId: id, content: gen(i) })));
    stockRows += n;
  }
  for (const v of p.variants ?? []) await insertProduct(v, id);
}
for (const p of catalog) await insertProduct(p, null);

await db.insert(vouchers).values([
  { storeId, code: 'WELCOME10', kind: 'percent', value: 1000, perUserLimit: 1 },
  { storeId, code: 'HEMAT1', kind: 'fixed', value: 100, minTotal: 500, maxUses: 100, perUserLimit: 1 },
]);

await updateSettings(storeId, {
  referralPercentBp: 500,
  referralMaxPerTopup: 300,
  referralMinWithdraw: 100,
  topupMin: 100,
  topupBonusTiers: [
    { minAmount: 2000, percentBp: 200 },
    { minAmount: 5000, percentBp: 500 },
  ],
  orderPaymentTtlMinutes: 15,
  fxRates: { IDR: 16300, EUR: 0.92, GBP: 0.79, MYR: 4.7, SGD: 1.35, PHP: 58, THB: 36, VND: 25400, INR: 83.5 },
  supportedLanguages: ['id', 'en'],
  storeName: 'TokoLafan',
  channelUrl: process.env.CHANNEL_URL || null,
  supportUsername: null,
});

const [{ n: productCount } = { n: 0 }] = await db.select({ n: count() }).from(products);
console.log(`seed: ${productCount} products, ${stockRows} stock rows, 2 vouchers, settings written`);
process.exit(0);
