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
  if (from[0] !== to[0]) return false;

  const fromRank = parseInt(from[1], 10);
  const toRank = parseInt(to[1], 10);
  const expectedRank = color === 'w' ? fromRank - 1 : fromRank + 1;
  if (toRank !== expectedRank) return false;

  if ((color === 'w' && toRank === 1) || (color === 'b' && toRank === 8)) return false;

  if (gameCopy.get(to as any)) return false;

  gameCopy.remove(from as any);
  gameCopy.put({ type: 'p', color }, to as any);

  const fenParts = gameCopy.fen().split(' ');
  fenParts[1] = fenParts[1] === 'w' ? 'b' : 'w';
  fenParts[3] = '-';
  gameCopy.load(fenParts.join(' '));

  return true;
}

function getKnightTargets(square: string): string[] {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10) - 1;
  const offsets = [
    [1, 2], [2, 1], [2, -1], [1, -2],
    [-1, -2], [-2, -1], [-2, 1], [-1, 2],
  ];
  const squares: string[] = [];
  for (const [df, dr] of offsets) {
    const f = file + df;
    const r = rank + dr;
    if (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
      squares.push(String.fromCharCode(97 + f) + (r + 1));
    }
  }
  return squares;
}

function getSoulValueForCapture(
  capturedPiece: { type: string; color: Color },
  abilities: Record<Color, Record<string, number>>
): number {
  if (capturedPiece.type === 'r' && (abilities[capturedPiece.color]['sacrifice-rook'] ?? 0) > 0) {
    return 13;
  }
  return SOUL_VALUES[capturedPiece.type] ?? 0;
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

  const [bonusMoveAvailable, setBonusMoveAvailable] = useState<{
    square: string;
    color: Color;
  } | null>(null);

  const [rookSacrificeBanner, setRookSacrificeBanner] = useState(false);

  const resolveBonusMove = useCallback(
    (targetSquare: string) => {
      if (!bonusMoveAvailable) return false;
      const { square: fromSquare, color } = bonusMoveAvailable;

      if (!getKnightTargets(fromSquare).includes(targetSquare)) return false;

      const gameCopy = new Chess(game.fen());
      if (gameCopy.get(targetSquare as any)) return false;

      const piece = gameCopy.get(fromSquare as any);
      if (!piece || piece.type !== 'n' || piece.color !== color) return false;

      gameCopy.remove(fromSquare as any);
      gameCopy.put({ type: 'n', color }, targetSquare as any);

      const opponent: Color = color === 'w' ? 'b' : 'w';
      const checkParts = gameCopy.fen().split(' ');
      checkParts[1] = opponent;
      const checkInstance = new Chess(checkParts.join(' '));
      if (checkInstance.inCheck()) return false;

      const finalParts = gameCopy.fen().split(' ');
      finalParts[1] = opponent;
      finalParts[3] = '-';
      setGame(new Chess(finalParts.join(' ')));
      setBonusMoveAvailable(null);

      if (shopArmed) {
        setShopOpenFor(color);
        setShopArmed(false);
      }

      return true;
    },
    [bonusMoveAvailable, game, shopArmed]
  );

  const skipBonusMove = useCallback(() => {
    if (!bonusMoveAvailable) return;
    const { color } = bonusMoveAvailable;
    const opponent: Color = color === 'w' ? 'b' : 'w';
    const fenParts = game.fen().split(' ');
    fenParts[1] = opponent;
    fenParts[3] = '-';
    setGame(new Chess(fenParts.join(' ')));
    setBonusMoveAvailable(null);

    if (shopArmed) {
      setShopOpenFor(color);
      setShopArmed(false);
    }
  }, [bonusMoveAvailable, game, shopArmed]);

  const onPieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
      if (!targetSquare || customGameOver) return false;

      if (bonusMoveAvailable) {
        if (sourceSquare !== bonusMoveAvailable.square) return false;
        return resolveBonusMove(targetSquare);
      }

      const mover = game.turn();
      const gameCopy = new Chess(game.fen());

      if (isPromotionMove(gameCopy, sourceSquare, targetSquare)) {
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
            const soulValue = getSoulValueForCapture(targetPieceBefore, abilities);
            setSouls((prev) => ({ ...prev, [lostColor]: prev[lostColor] + soulValue }));
            if (targetPieceBefore.type === 'r' && soulValue === 13) {
              setRookSacrificeBanner(true);
              setTimeout(() => setRookSacrificeBanner(false), 2500);
            }
          }

          const isBattleTrainedCapture =
            move.piece === 'n' &&
            !!move.captured &&
            (abilities[mover]['battle-trained'] ?? 0) > 0;

          if (isBattleTrainedCapture) {
            const fenParts = gameCopy.fen().split(' ');
            fenParts[1] = mover;
            setGame(new Chess(fenParts.join(' ')));
            setBonusMoveAvailable({ square: move.to, color: mover });
            return true;
          }

          setGame(gameCopy);
          if (shopArmed) {
            setShopOpenFor(mover);
            setShopArmed(false);
          }
          return true;
        }
      } catch {
        // fall through to backward-pawn check
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
    [game, shopArmed, customGameOver, abilities, bonusMoveAvailable, resolveBonusMove]
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
            const soulValue = getSoulValueForCapture(targetPieceBefore, abilities);
            setSouls((prev) => ({ ...prev, [lostColor]: prev[lostColor] + soulValue }));
            if (targetPieceBefore.type === 'r' && soulValue === 13) {
              setRookSacrificeBanner(true);
              setTimeout(() => setRookSacrificeBanner(false), 2500);
            }
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
    bonusMoveAvailable,
    rookSacrificeBanner,
    skipBonusMove,
    onPieceDrop,
    armShop,
    buyItem,
    closeShop,
    detonateBishop,
    choosePromotion,
    resetGame,
  };
}