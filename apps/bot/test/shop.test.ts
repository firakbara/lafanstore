import { describe, expect, test } from 'bun:test';
import type { ProductListItem, ProductPage } from '@tokobun/core';
import { cb } from '../src/callback';
import type { Button, Keyboard } from '../src/keyboards';
import { inStock, productButton, shopScreen } from '../src/screens/shop';
import { withNotice, type Screen } from '../src/screens/types';
import type { View } from '../src/util/view';

function mockView(): View {
  return {
    lang: 'en',
    currency: 'USD',
    tzOffset: 0,
    t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
    tp: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
    money: (amount) => `$${amount}`,
    date: (d) => d.toISOString(),
  };
}

const item = (over: Partial<ProductListItem> = {}): ProductListItem => ({
  id: 1,
  code: 'NFX',
  name: 'Netflix',
  icon: '🎬',
  customEmojiId: null,
  price: 250,
  isCollection: false,
  variantCount: 0,
  stock: 12,
  hasPromo: false,
  ...over,
});

const labels = (kb: Keyboard) => kb.map((row) => row.map((b) => b.text));
const data = (b: Button) => ('callback_data' in b ? b.callback_data : undefined);

// ---------- inStock ----------

describe('inStock', () => {
  test('null stock -> true (unlimited)', () => {
    expect(inStock({ stock: null })).toBe(true);
  });

  test('stock > 0 -> true', () => {
    expect(inStock({ stock: 5 })).toBe(true);
    expect(inStock({ stock: 1 })).toBe(true);
    expect(inStock({ stock: 999 })).toBe(true);
  });

  test('stock === 0 -> false', () => {
    expect(inStock({ stock: 0 })).toBe(false);
  });

  test('negative stock -> false', () => {
    expect(inStock({ stock: -1 })).toBe(false);
    expect(inStock({ stock: -100 })).toBe(false);
  });
});

// ---------- withNotice ----------

describe('withNotice', () => {
  test('prepends notice + double newline to screen text', () => {
    const base: Screen = { text: 'body text', keyboard: [[{ text: 'OK', callback_data: 'x' }]] };
    const s = withNotice(base, 'Alert!');
    expect(s.text).toBe('Alert!\n\nbody text');
  });

  test('preserves keyboard', () => {
    const kb: Keyboard = [[{ text: 'A', callback_data: 'a' }], [{ text: 'B', callback_data: 'b' }]];
    const base: Screen = { text: 'hi', keyboard: kb };
    const s = withNotice(base, 'Notice');
    expect(s.keyboard).toEqual(kb);
  });

  test('preserves photo if present', () => {
    const photo = new Uint8Array([1, 2, 3]);
    const base: Screen = { text: 'caption', keyboard: [], photo };
    const s = withNotice(base, 'Warning');
    expect(s.text).toBe('Warning\n\ncaption');
    expect(s.photo).toBe(photo);
  });
});

// ---------- productButton ----------

describe('productButton', () => {
  const v = mockView();

  test('regular product with icon, in stock (success style)', () => {
    const b = productButton(v, item({ stock: 5 }));
    expect(b.style).toBe('success');
    expect(b.text).toContain('🎬 ');
    expect(b.text).toContain('Netflix');
    expect(data(b)).toBe(cb.product(1, 1));
  });

  test('sold-out product (stock 0, danger style)', () => {
    const b = productButton(v, item({ stock: 0 }));
    expect(b.style).toBe('danger');
    expect(data(b)).toBe(cb.product(1, 1));
  });

  test('collection item', () => {
    const b = productButton(v, item({ isCollection: true, variantCount: 3, id: 7 }));
    expect(b.style).toBe('success');
    expect(data(b)).toBe(cb.shop(1, 'all', 7));
    expect(b.text).toContain('shop.itemCollection');
  });

  test('product with customEmojiId', () => {
    const b = productButton(v, item({ icon: '🎬', customEmojiId: '12345' }));
    // When customEmojiId is set, icon prefix is empty string (icon not rendered as text)
    expect(b.icon_custom_emoji_id).toBe('12345');
    // The icon param should be '' because customEmojiId suppresses the text icon
    expect(b.text).not.toContain('🎬');
  });

  test('product without icon', () => {
    const b = productButton(v, item({ icon: null }));
    expect(b.style).toBe('success');
    // icon prefix should be '' since icon is null
    expect(b.text).toContain('Netflix');
    expect(data(b)).toBe(cb.product(1, 1));
  });
});

// ---------- shopScreen ----------

describe('shopScreen', () => {
  const v = mockView();

  test('empty page shows shop.empty text', () => {
    const page: ProductPage = { items: [], page: 1, totalPages: 1, total: 0 };
    const s = shopScreen(v, { page, sort: 'all', parent: null });
    expect(s.text).toBe('shop.empty');
  });

  test('page with items builds keyboard with product buttons + controls', () => {
    const page: ProductPage = {
      items: [item(), item({ id: 2, name: 'Spotify', stock: 0 })],
      page: 1,
      totalPages: 3,
      total: 20,
    };
    const s = shopScreen(v, { page, sort: 'all', parent: null });

    // Text should be shop.title with page info
    expect(s.text).toContain('shop.title');

    // First rows are product buttons (one per item)
    expect(s.keyboard[0]).toHaveLength(1);
    expect(s.keyboard[1]).toHaveLength(1);
    expect(s.keyboard[0]![0]!.style).toBe('success'); // in stock
    expect(s.keyboard[1]![0]!.style).toBe('danger'); // sold out

    // Controls row: refresh + sort
    const ctrlRow = s.keyboard[2]!;
    expect(ctrlRow).toHaveLength(2);
    expect(data(ctrlRow[0]!)).toBe(cb.shopRefresh(1, 'all'));
    expect(data(ctrlRow[1]!)).toBe(cb.shop(1, 'available'));

    // Pager row (since totalPages > 1)
    const navRow = s.keyboard[3]!;
    expect(navRow).toHaveLength(3);

    // Back button row
    const backRow = s.keyboard[4]!;
    expect(backRow).toHaveLength(1);
    expect(data(backRow[0]!)).toBe(cb.main());
  });

  test('with parent shows variantsTitle', () => {
    const page: ProductPage = {
      items: [item()],
      page: 1,
      totalPages: 1,
      total: 1,
    };
    const s = shopScreen(v, { page, sort: 'all', parent: { id: 5, name: 'Bundle' } });
    expect(s.text).toContain('shop.variantsTitle');
    expect(s.text).toContain('Bundle');
  });

  test('back button goes to main when no parent', () => {
    const page: ProductPage = { items: [], page: 1, totalPages: 1, total: 0 };
    const s = shopScreen(v, { page, sort: 'all', parent: null });
    const backRow = s.keyboard.at(-1)!;
    expect(data(backRow[0]!)).toBe(cb.main());
  });

  test('back button goes to shop when parent is set', () => {
    const page: ProductPage = {
      items: [item()],
      page: 1,
      totalPages: 1,
      total: 1,
    };
    const s = shopScreen(v, { page, sort: 'promo', parent: { id: 10, name: 'Pack' } });
    const backRow = s.keyboard.at(-1)!;
    expect(data(backRow[0]!)).toBe(cb.shop(1, 'all'));
  });
});
