export interface Mutator {
  id: string;
  name: string;
  description: string;
  applyToStartingPosition: (fen: string) => string;
}

export interface Mutator {
  id: string;
  name: string;
  description: string;
  applyToStartingPosition: (fen: string) => string;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  cost: number;
}