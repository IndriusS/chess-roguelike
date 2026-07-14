import type { ShopItem } from './types';

export const suicideBishopItem: ShopItem = {
  id: 'suicide-bishop',
  name: 'Suicide Bishops',
  description:
    'Permanently allows your bishops to detonate instead of moving, destroying every piece (yours or theirs) in the 3x3 area around it.',
  cost: 7,
};

export const backwardPawnItem: ShopItem = {
  id: 'backward-pawn',
  name: 'Retreating Pawns',
  description:
    'Permanently allows your pawns to move one square backward (no captures) for the rest of this game.',
  cost:1,
};

export const battleTrainedItem: ShopItem = {
  id: 'battle-trained',
  name: 'Battle Trained Horse',
  description:
    'Permanently allows your knights to make an immediate bonus move after capturing a piece. The bonus move cannot capture or give check.',
  cost: 6,
};

export const sacrificeRookItem: ShopItem = {
  id: 'sacrifice-rook',
  name: 'SACRIFICES... THE ROOOOOOK!',
  description: 'When one of your rooks is captured, you gain 13 souls instead of the normal amount.',
  cost: 2,
};

export const horsebackRidingItem: ShopItem = {
  id: 'horseback-riding',
  name: 'Took Horseback Riding Lessons',
  description:
    'If your queen captures a knight (enemy or your own), she permanently gains the ability to also move like a knight.',
  cost: 6,
};


export const goldenThrone: ShopItem = {
  id: 'golden-throne',
  name: 'Golden Throne',
  description:
    'Gain +1 soul each turn your king stays still. Breaks permanently the moment your king moves (including castling).',
  cost: 2,
 };


export const allShopItems: ShopItem[] = [
  suicideBishopItem,
  backwardPawnItem,
  battleTrainedItem,
  sacrificeRookItem,
  horsebackRidingItem,
  goldenThrone
];



