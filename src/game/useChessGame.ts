import { useState, useCallback, useMemo } from 'react';
import { Chess } from 'chess.js';
import type { Mutator, ShopItem } from '../roguelike/types';

const [explodingSquares, setExplodingSquares] = useState<string[]>([]);
const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const SOUL_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

type Color = 'w' | 'b';

function buildStartingPosition(activeMutators: Mutator[]): string {
  return activeMutators.reduce(
    (fen, mutator) => mutator.applyToStartingPosition(fen),
    STARTING_FEN
  );
}

function getBlastSquares(square: string): string[] {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = parseInt(square[1], 10) - 1;
  const squares: string[] = [];
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      const f = file + df;
      const r = rank + dr;
      if (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
        squares.push(String.fromCharCode('a'.charCodeAt(0) + f) + (r + 1));
      }
    }
  }
  return squares;
}

export function useChessGame(activeMutators: Mutator[]) {
  const [game, setGame] = useState(() => new Chess(buildStartingPosition(activeMutators)));
  const [souls, setSouls] = useState<Record<Color, number>>({ w: 0, b: 0 });
  const [abilities, setAbilities] = useState<Record<Color, Record<string, number>>>({
    w: {},
    b: {},
  });
  const [shopArmed, setShopArmed] = useState(false);
  const [shopOpenFor, setShopOpenFor] = useState<Color | null>(null);
  const [customGameOver, setCustomGameOver] = useState<{ winner: Color; reason: string } | null>(
    null
  );

  const onPieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
      if (!targetSquare || customGameOver) return false;

      const mover = game.turn();
      const gameCopy = new Chess(game.fen());
      const targetPieceBefore = gameCopy.get(targetSquare as any);

      try {
        const move = gameCopy.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
        if (move === null) return false;

        if (targetPieceBefore) {
          const lostColor = targetPieceBefore.color as Color;
          const soulValue = SOUL_VALUES[targetPieceBefore.type] ?? 0;
          setSouls((prev) => ({ ...prev, [lostColor]: prev[lostColor] + soulValue }));
        }

        setGame(gameCopy);

        if (shopArmed) {
          setShopOpenFor(mover);
          setShopArmed(false);
        }

        return true;
      } catch {
        return false;
      }
    },
    [game, shopArmed, customGameOver]
  );

  const armShop = useCallback(() => {
    setShopArmed((prev) => !prev);
  }, []);

  const buyItem = useCallback(
    (item: ShopItem) => {
      if (!shopOpenFor) return;
      const color = shopOpenFor;
      if (souls[color] < item.cost) return;

      setSouls((prev) => ({ ...prev, [color]: prev[color] - item.cost }));
      setAbilities((prev) => ({
        ...prev,
        [color]: { ...prev[color], [item.id]: (prev[color][item.id] ?? 0) + 1 },
      }));
      setShopOpenFor(null);
    },
    [shopOpenFor, souls]
  );

  const closeShop = useCallback(() => {
    setShopOpenFor(null);
  }, []);

const detonateBishop = useCallback(
    (square: string) => {
      const color = game.turn();
      if ((abilities[color]['suicide-bishop'] ?? 0) <= 0) return;

      const opponent: Color = color === 'w' ? 'b' : 'w';
      const blastSquares = getBlastSquares(square);

      // Phase 1: flash the blast radius while pieces are still on the board
      setExplodingSquares(blastSquares);

      setTimeout(() => {
        const gameCopy = new Chess(game.fen());
        const piece = gameCopy.get(square as any);
        if (!piece || piece.type !== 'b' || piece.color !== color) {
          setExplodingSquares([]);
          return;
        }

        let kingDestroyed: Color | null = null;
        let totalSoulsFromBlast = 0;

        for (const sq of blastSquares) {
          const targetPiece = gameCopy.get(sq as any);
          if (targetPiece) {
            if (targetPiece.type === 'k') {
              kingDestroyed = targetPiece.color as Color;
            }
            totalSoulsFromBlast += SOUL_VALUES[targetPiece.type] ?? 0;
            gameCopy.remove(sq as any);
          }
        }

        if (totalSoulsFromBlast > 0) {
          setSouls((prev) => ({ ...prev, [opponent]: prev[opponent] + totalSoulsFromBlast }));
        }

        setAbilities((prev) => ({
          ...prev,
          [color]: {
            ...prev[color],
            'suicide-bishop': Math.max(0, (prev[color]['suicide-bishop'] ?? 0) - 1),
          },
        }));

        if (kingDestroyed) {
          const winner: Color = kingDestroyed === 'w' ? 'b' : 'w';
          setCustomGameOver({
            winner,
            reason: `${kingDestroyed === 'w' ? "White's" : "Black's"} king was destroyed in the blast! `,
          });
          setGame(gameCopy);
        } else {
          const fenParts = gameCopy.fen().split(' ');
          fenParts[1] = fenParts[1] === 'w' ? 'b' : 'w';
          fenParts[3] = '-';
          setGame(new Chess(fenParts.join(' ')));
        }

        // Phase 2: let the flash linger briefly on the now-empty squares, then clear it
        setTimeout(() => setExplodingSquares([]), 300);
      }, 250);
    },
    [game, abilities]
  );

  const ownBishopSquares = useMemo(() => {
    const squares: string[] = [];
    const board = game.board();
    for (const row of board) {
      for (const square of row) {
        if (square && square.type === 'b' && square.color === game.turn()) {
          squares.push(square.square);
        }
      }
    }
    return squares;
  }, [game]);

  const resetGame = useCallback(() => {
    setGame(new Chess(buildStartingPosition(activeMutators)));
    setSouls({ w: 0, b: 0 });
    setAbilities({ w: {}, b: {} });
    setShopArmed(false);
    setShopOpenFor(null);
    setCustomGameOver(null);
  }, [activeMutators]);

return {
  game,
  souls,
  abilities,
  shopArmed,
  shopOpenFor,
  customGameOver,
  ownBishopSquares,
  explodingSquares,
  onPieceDrop,
  armShop,
  buyItem,
  closeShop,
  detonateBishop,
  resetGame,
};
}

