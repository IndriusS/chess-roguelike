import { useState, useCallback, useMemo } from 'react';
import { Chess } from 'chess.js';
import type { Mutator, ShopItem } from '../roguelike/types';

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

function isPromotionMove(gameCopy: Chess, from: string, to: string): boolean {
  const piece = gameCopy.get(from as any);
  if (!piece || piece.type !== 'p') return false;
  const toRank = parseInt(to[1], 10);
  return (piece.color === 'w' && toRank === 8) || (piece.color === 'b' && toRank === 1);
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

function tryBackwardPawnMove(gameCopy: Chess, from: string, to: string, color: Color): boolean {
  const piece = gameCopy.get(from as any);
  if (!piece || piece.type !== 'p' || piece.color !== color) return false;
  if (from[0] !== to[0]) return false; // must stay on the same file, no diagonals

  const fromRank = parseInt(from[1], 10);
  const toRank = parseInt(to[1], 10);
  const expectedRank = color === 'w' ? fromRank - 1 : fromRank + 1;
  if (toRank !== expectedRank) return false; // must be exactly one square back

  if ((color === 'w' && toRank === 1) || (color === 'b' && toRank === 8)) return false; // can't retreat onto the back rank

  if (gameCopy.get(to as any)) return false; // no capturing backward, target must be empty

  gameCopy.remove(from as any);
  gameCopy.put({ type: 'p', color }, to as any);

  // Not a chess.js-recognized move, so flip the turn manually
  const fenParts = gameCopy.fen().split(' ');
  fenParts[1] = fenParts[1] === 'w' ? 'b' : 'w';
  fenParts[3] = '-';
  gameCopy.load(fenParts.join(' '));

  return true;
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

  const [explodingSquares, setExplodingSquares] = useState<string[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<{
  from: string;
  to: string;
} | null>(null);
const onPieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
      if (!targetSquare || customGameOver) return false;

      const mover = game.turn();
      const gameCopy = new Chess(game.fen());

      if (isPromotionMove(gameCopy, sourceSquare, targetSquare)) {
        // Confirm it's actually a legal move before opening the promotion picker
        const testMove = new Chess(game.fen());
        try {
          const legalCheck = testMove.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
          if (legalCheck === null) return false;
        } catch {
          return false;
        }
        setPendingPromotion({ from: sourceSquare, to: targetSquare });
        return true;
      }

      const targetPieceBefore = gameCopy.get(targetSquare as any);

      try {
        const move = gameCopy.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
        if (move !== null) {
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
        }
      } catch {
        // Not a legal chess.js move — fall through to check the backward-pawn case
      }

      if ((abilities[mover]['backward-pawn'] ?? 0) > 0) {
        const retreated = tryBackwardPawnMove(gameCopy, sourceSquare, targetSquare, mover);
        if (retreated) {
          setGame(gameCopy);
          if (shopArmed) {
            setShopOpenFor(mover);
            setShopArmed(false);
          }
          return true;
        }
      }

      return false;
    },
    [game, shopArmed, customGameOver, abilities]
  );

  const armShop = useCallback(() => {
    setShopArmed((prev) => !prev);
  }, []);

  const choosePromotion = useCallback(
    (pieceType: 'q' | 'r' | 'b' | 'n') => {
      if (!pendingPromotion) return;
      const mover = game.turn();
      const gameCopy = new Chess(game.fen());
      const targetPieceBefore = gameCopy.get(pendingPromotion.to as any);

      const move = gameCopy.move({
        from: pendingPromotion.from,
        to: pendingPromotion.to,
        promotion: pieceType,
      });
      if (move === null) {
        setPendingPromotion(null);
        return;
      }

      if (targetPieceBefore) {
        const lostColor = targetPieceBefore.color as Color;
        const soulValue = SOUL_VALUES[targetPieceBefore.type] ?? 0;
        setSouls((prev) => ({ ...prev, [lostColor]: prev[lostColor] + soulValue }));
      }

      setGame(gameCopy);
      setPendingPromotion(null);

      if (shopArmed) {
        setShopOpenFor(mover);
        setShopArmed(false);
      }
    },
    [pendingPromotion, game, shopArmed]
  );

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
    pendingPromotion,
    onPieceDrop,
    armShop,
    buyItem,
    closeShop,
    detonateBishop,
    choosePromotion,
    resetGame,
  };
}

