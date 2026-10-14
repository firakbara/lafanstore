import type { CatalogSort, ProductListItem, ProductPage } from '@tokobun/core';
import { cb, nextSort } from '../callback';
import { btn, pager, type Button, type Keyboard } from '../keyboards';
import type { View } from '../util/view';
import type { Screen } from './types';

export function inStock(item: { stock: number | null }): boolean {
  return item.stock === null || item.stock > 0;
}

export function productButton(v: View, item: ProductListItem): Button {
  const icon = item.icon && !item.customEmojiId ? `${item.icon} ` : '';
  const style = inStock(item) ? 'success' : 'danger';
  if (item.isCollection) {
    return btn(v.tp('shop.itemCollection', { icon, name: item.name, count: item.variantCount }), cb.shop(1, 'all', item.id), {
      style,
      emojiId: item.customEmojiId,
    });
  }
  const label = v.tp('shop.item', {
    icon,
    name: item.name,
    price: v.money(item.price),
    stock: item.stock === null ? v.tp('common.unlimited') : item.stock,
  });
  return btn(label, cb.product(item.id, 1), { style, emojiId: item.customEmojiId });
}

export function shopScreen(
  v: View,
  data: { page: ProductPage; sort: CatalogSort; parent: { id: number; name: string } | null },
): Screen {
  const { page, sort, parent } = data;
  const parentId = parent?.id ?? null;
  const text = page.items.length === 0
    ? v.t('shop.empty')
    : parent
      ? v.t('shop.variantsTitle', { name: parent.name, page: page.page, totalPages: page.totalPages, total: page.total })
      : v.t('shop.title', { page: page.page, totalPages: page.totalPages, total: page.total });

  const keyboard: Keyboard = page.items.map((item) => [productButton(v, item)]);
  keyboard.push([
    btn(v.tp('shop.refresh'), cb.shopRefresh(page.page, sort, parentId)),
    btn(v.tp('shop.sort', { sort: v.tp(`shop.sort.${sort}`) }), cb.shop(1, nextSort(sort), parentId)),
  ]);
  const nav = pager(page.page, page.totalPages, (p) => cb.shop(p, sort, parentId), {
    prev: v.tp('common.prev'),
    next: v.tp('common.next'),
    page: v.tp('common.page', { page: page.page, total: page.totalPages }),
  });
  if (nav.length) keyboard.push(nav);
  keyboard.push([btn(v.tp('common.back'), parentId ? cb.shop(1, 'all') : cb.main())]);
  return { text, keyboard };
}
