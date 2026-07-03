import type { ShopItem } from './types';

export const suicideBishopItem: ShopItem = {
  id: 'suicide-bishop',
  name: 'Suicide Bishops',
  description:
    'Permanently allows your bishops to detonate instead of moving, destroying every piece (yours or theirs) in the 3x3 area around it.',
  cost: 10,
};

export const backwardPawnItem: ShopItem = {
  id: 'backward-pawn',
  name: 'Retreating Pawns',
  description:
    'Permanently allows your pawns to move one square backward (no captures) for the rest of this game.',
  cost: 2,
};

export const battleTrainedItem: ShopItem = {
  id: 'battle-trained',
  name: 'Battle Trained Horse',
  description:
    'Permanently allows your knights to make an immediate bonus move after capturing a piece. The bonus move cannot capture or give check.',
  cost: 8,
};

export const allShopItems: ShopItem[] = [suicideBishopItem, backwardPawnItem, battleTrainedItem];