import { rowPaginationFeature, rowSortingFeature, tableFeatures, type ColumnDef } from '@tanstack/svelte-table';

/** Every admin table uses server-side sorting + pagination. Column ids == server sort keys. */
export const features = tableFeatures({ rowSortingFeature, rowPaginationFeature });
export type Features = typeof features;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type Columns<T extends Row> = ColumnDef<Features, T>[];
