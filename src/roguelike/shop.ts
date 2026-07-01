import type { ShopItem } from './types';

export const suicideBishopItem: ShopItem = {
  id: 'suicide-bishop',
  name: 'Suicide Bishops',
  description:
    'One of your bishops can detonate instead of moving, destroying every piece (yours or theirs) in the 3x3 area around it.',
  cost: 10,
};

export const allShopItems: ShopItem[] = [suicideBishopItem];