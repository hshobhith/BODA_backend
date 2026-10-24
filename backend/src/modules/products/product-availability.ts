import { Product, ProductStatus } from './entities/product.entity';

/** Today's date as 'YYYY-MM-DD' in server-local time, comparable with `Product.expiryDate`. */
export function localDateString(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function isExpired(product: Pick<Product, 'expiryDate'>): boolean {
  return !!product.expiryDate && product.expiryDate < localDateString();
}

/**
 * Why a product can't be bought right now, or null if it can. Stock is
 * checked separately since it depends on the quantity and variant.
 */
export function purchaseBlockReason(
  product: Pick<Product, 'name' | 'status' | 'isAvailable' | 'expiryDate'>,
): string | null {
  if (product.status !== ProductStatus.ACTIVE) {
    return `"${product.name}" is no longer sold`;
  }
  if (!product.isAvailable) {
    return `"${product.name}" is currently unavailable`;
  }
  if (isExpired(product)) {
    return `"${product.name}" has expired and can't be sold`;
  }
  return null;
}

export interface SelectedAddon {
  groupId: string;
  groupName: string;
  optionId: string;
  name: string;
  price: number;
}

/**
 * Checks a customer's add-on choice against the product's current groups.
 * `addons` comes back in menu order (group, then option), so two selections
 * of the same options compare equal regardless of the order they were sent in.
 */
export function resolveAddonSelection(
  product: Pick<Product, 'name' | 'addonGroups'>,
  optionIds: string[],
): { addons: SelectedAddon[]; error: string | null } {
  const wanted = new Set(optionIds);
  const addons: SelectedAddon[] = [];
  let error: string | null = wanted.size !== optionIds.length ? 'The same option was chosen twice' : null;

  for (const group of product.addonGroups ?? []) {
    const chosen = group.options.filter((option) => wanted.has(option.id));
    for (const option of chosen) {
      wanted.delete(option.id);
      if (!option.isAvailable) {
        error ??= `"${option.name}" is currently unavailable`;
      }
      addons.push({
        groupId: group.id,
        groupName: group.name,
        optionId: option.id,
        name: option.name,
        price: option.price,
      });
    }
    if (chosen.length < group.minSelect) {
      error ??= `Choose at least ${group.minSelect} for "${group.name}"`;
    } else if (chosen.length > group.maxSelect) {
      error ??= `Choose at most ${group.maxSelect} for "${group.name}"`;
    }
  }

  if (wanted.size > 0) {
    error ??= `Some options for "${product.name}" are no longer offered`;
  }
  return { addons, error };
}
