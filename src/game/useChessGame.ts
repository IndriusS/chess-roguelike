import { useState, useCallback, useMemo, useEffect } from 'react';
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

function findKingSquare(chessInstance: Chess, color: Color): string | null {
  const board = chessInstance.board();
  for (const row of board) {
    for (const square of row) {
      if (square && square.type === 'k' && square.color === color) {
        return square.square;
      }
    }
  }
  return null;
}

// Checks whether kingColor's king is currently sitting a knight's-jump away
// from an opponent queen that has the Horseback Riding ability active.
// Reads live from the board, so if that queen has been captured this
// automatically (and correctly) returns false.
function isKnightChecked(
  chessInstance: Chess,
  kingColor: Color,
  horsebackQueenSquare: Record<Color, string | null>
): boolean {
  const opponent: Color = kingColor === 'w' ? 'b' : 'w';
  const queenSquare = horsebackQueenSquare[opponent];
  if (!queenSquare) return false;
  const queenPiece = chessInstance.get(queenSquare as any);
  if (!queenPiece || queenPiece.type !== 'q' || queenPiece.color !== opponent) return false;
  const kingSquare = findKingSquare(chessInstance, kingColor);
  if (!kingSquare) return false;
  return getKnightTargets(queenSquare).includes(kingSquare);
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
  const [horsebackQueenSquare, setHorsebackQueenSquare] = useState<Record<Color, string | null>>({
    w: null,
    b: null,
  });
  // Golden Throne: once a color's king has moved (including castling) this
  // flips to true and the ability stops paying out for that color, unless
  // Golden Throne is (re)purchased - buyItem resets this back to false at
  // purchase time so the ability always starts fresh, regardless of any
  // king movement earlier in the game.
  const [kingHasMoved, setKingHasMoved] = useState<Record<Color, boolean>>({
    w: false,
    b: false,
  });

  const knightCheck = useMemo<Color | null>(() => {
    if (isKnightChecked(game, 'w', horsebackQueenSquare)) return 'w';
    if (isKnightChecked(game, 'b', horsebackQueenSquare)) return 'b';
    return null;
  }, [game, horsebackQueenSquare]);

  const knightCheckmate = useMemo(() => {
    if (!knightCheck) return false;
    const mover = knightCheck;
    if (game.turn() !== mover) return false;
    const opponent: Color = mover === 'w' ? 'b' : 'w';
    const queenSquare = horsebackQueenSquare[opponent];
    if (!queenSquare) return false;

    const legalMoves = game.moves({ verbose: true }) as any[];

    const kingEscapes = legalMoves.some((m) => {
      if (m.piece !== 'k') return false;
      const testGame = new Chess(game.fen());
      testGame.move({ from: m.from, to: m.to, promotion: 'q' });
      return !isKnightChecked(testGame, mover, horsebackQueenSquare);
    });

    const canCaptureQueen = legalMoves.some((m) => m.to === queenSquare);

    return !kingEscapes && !canCaptureQueen;
  }, [game, knightCheck, horsebackQueenSquare]);

  useEffect(() => {
    if (knightCheckmate && !customGameOver && knightCheck) {
      const winner: Color = knightCheck === 'w' ? 'b' : 'w';
      setCustomGameOver({
        winner,
        reason: `${knightCheck === 'w' ? "White's" : "Black's"} king was checkmated by a knight-move queen attack! `,
      });
    }
  }, [knightCheckmate, knightCheck, customGameOver]);

  // Golden Throne: call this once per completed turn, from every path that
  // ends a turn. Pass kingMoved=true only when this turn's move was the
  // king itself moving (normal move OR castling - chess.js tags both with
  // piece: 'k'). Everything else (backward pawn, bishop detonate, knight
  // bonus move, horseback moves, promotion) never moves the king, so they
  // always pass false.
  const applyGoldenThrone = useCallback(
    (mover: Color, kingMoved: boolean) => {
      if (kingMoved) {
        if (!kingHasMoved[mover]) {
          setKingHasMoved((prev) => ({ ...prev, [mover]: true }));
        }
        return;
      }
      if (!kingHasMoved[mover] && (abilities[mover]['golden-throne'] ?? 0) > 0) {
        setSouls((prev) => ({ ...prev, [mover]: prev[mover] + 1 }));
      }
    },
    [abilities, kingHasMoved]
  );

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
      applyGoldenThrone(color, false);
      setGame(new Chess(finalParts.join(' ')));
      setBonusMoveAvailable(null);

      if (shopArmed) {
        setShopOpenFor(color);
        setShopArmed(false);
      }

      return true;
    },
    [bonusMoveAvailable, game, shopArmed, applyGoldenThrone]
  );

  const skipBonusMove = useCallback(() => {
    if (!bonusMoveAvailable) return;
    const { color } = bonusMoveAvailable;
    const opponent: Color = color === 'w' ? 'b' : 'w';
    const fenParts = game.fen().split(' ');
    fenParts[1] = opponent;
    fenParts[3] = '-';
    applyGoldenThrone(color, false);
    setGame(new Chess(fenParts.join(' ')));
    setBonusMoveAvailable(null);

    if (shopArmed) {
      setShopOpenFor(color);
      setShopArmed(false);
    }
  }, [bonusMoveAvailable, game, shopArmed, applyGoldenThrone]);

  const onPieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
      if (!targetSquare || customGameOver) return false;

      if (bonusMoveAvailable) {
        if (sourceSquare !== bonusMoveAvailable.square) return false;
        return resolveBonusMove(targetSquare);
      }

      const mover = game.turn();
      const gameCopy = new Chess(game.fen());

      // Horseback Riding: sacrifice your own knight to instantly empower your queen
      const sourcePieceForSac = gameCopy.get(sourceSquare as any);
      const targetPieceForSac = gameCopy.get(targetSquare as any);
      if (
        sourcePieceForSac &&
        sourcePieceForSac.type === 'q' &&
        sourcePieceForSac.color === mover &&
        targetPieceForSac &&
        targetPieceForSac.type === 'n' &&
        targetPieceForSac.color === mover &&
        (abilities[mover]['horseback-riding'] ?? 0) > 0 &&
        horsebackQueenSquare[mover] !== sourceSquare
      ) {
        gameCopy.remove(sourceSquare as any);
        gameCopy.remove(targetSquare as any);
        gameCopy.put({ type: 'q', color: mover }, targetSquare as any);

        if (knightCheck === mover && isKnightChecked(gameCopy, mover, horsebackQueenSquare)) {
          return false;
        }

        setHorsebackQueenSquare((prev) => ({ ...prev, [mover]: targetSquare }));

        const fenParts = gameCopy.fen().split(' ');
        fenParts[1] = mover === 'w' ? 'b' : 'w';
        fenParts[3] = '-';
        applyGoldenThrone(mover, false);
        setGame(new Chess(fenParts.join(' ')));

        if (shopArmed) {
          setShopOpenFor(mover);
          setShopArmed(false);
        }
        return true;
      }

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
          if (knightCheck === mover && isKnightChecked(gameCopy, mover, horsebackQueenSquare)) {
            return false;
          }

          if (targetPieceBefore) {
            const lostColor = targetPieceBefore.color as Color;
            const soulValue = getSoulValueForCapture(targetPieceBefore, abilities);
            setSouls((prev) => ({ ...prev, [lostColor]: prev[lostColor] + soulValue }));
            if (targetPieceBefore.type === 'r' && soulValue === 13) {
              setRookSacrificeBanner(true);
              setTimeout(() => setRookSacrificeBanner(false), 2500);
            }
            if (targetPieceBefore.type === 'q') {
              setHorsebackQueenSquare((prev) => ({ ...prev, [lostColor]: null }));
            }
          }

          const empoweredByCapture =
            move.piece === 'q' &&
            move.captured === 'n' &&
            (abilities[mover]['horseback-riding'] ?? 0) > 0;
          const wasTrackedQueenMoving =
            move.piece === 'q' && horsebackQueenSquare[mover] === move.from;
          if (empoweredByCapture || wasTrackedQueenMoving) {
            setHorsebackQueenSquare((prev) => ({ ...prev, [mover]: move.to }));
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

          // Golden Throne check happens here, once we know the turn is
          // actually ending (i.e. not paused for a Battle Trained bonus
          // move). move.piece === 'k' covers both a normal king step and
          // castling, since chess.js tags castling moves with piece: 'k'.
          applyGoldenThrone(mover, move.piece === 'k');
          setGame(gameCopy);
          if (shopArmed) {
            setShopOpenFor(mover);
            setShopArmed(false);
          }
          return true;
        }
      } catch {
        // fall through to backward-pawn / horseback-move checks
      }

      if ((abilities[mover]['backward-pawn'] ?? 0) > 0 && knightCheck !== mover) {
        const retreated = tryBackwardPawnMove(gameCopy, sourceSquare, targetSquare, mover);
        if (retreated) {
          applyGoldenThrone(mover, false);
          setGame(gameCopy);
          if (shopArmed) {
            setShopOpenFor(mover);
            setShopArmed(false);
          }
          return true;
        }
      }

      // Horseback Riding: empowered queen moving like a knight
      if (
        (abilities[mover]['horseback-riding'] ?? 0) > 0 &&
        horsebackQueenSquare[mover] === sourceSquare &&
        getKnightTargets(sourceSquare).includes(targetSquare)
      ) {
        const piece = gameCopy.get(sourceSquare as any);
        if (piece && piece.type === 'q' && piece.color === mover) {
          const capturedPiece = gameCopy.get(targetSquare as any);
          if (!capturedPiece || capturedPiece.color !== mover) {
            gameCopy.remove(sourceSquare as any);
            if (capturedPiece) {
              gameCopy.remove(targetSquare as any);
            }
            gameCopy.put({ type: 'q', color: mover }, targetSquare as any);

            if (knightCheck === mover && isKnightChecked(gameCopy, mover, horsebackQueenSquare)) {
              return false;
            }

            if (capturedPiece) {
              const soulValue = getSoulValueForCapture(capturedPiece, abilities);
              setSouls((prev) => ({
                ...prev,
                [capturedPiece.color]: prev[capturedPiece.color] + soulValue,
              }));
              if (capturedPiece.type === 'r' && soulValue === 13) {
                setRookSacrificeBanner(true);
                setTimeout(() => setRookSacrificeBanner(false), 2500);
              }
              if (capturedPiece.type === 'q') {
                setHorsebackQueenSquare((prev) => ({ ...prev, [capturedPiece.color]: null }));
              }
            }

            setHorsebackQueenSquare((prev) => ({ ...prev, [mover]: targetSquare }));

            const fenParts = gameCopy.fen().split(' ');
            fenParts[1] = mover === 'w' ? 'b' : 'w';
            fenParts[3] = '-';
            applyGoldenThrone(mover, false);
            setGame(new Chess(fenParts.join(' ')));

            if (shopArmed) {
              setShopOpenFor(mover);
              setShopArmed(false);
            }
            return true;
          }
        }
      }

      return false;
    },
    [
      game,
      shopArmed,
      customGameOver,
      abilities,
      bonusMoveAvailable,
      resolveBonusMove,
      horsebackQueenSquare,
      knightCheck,
      applyGoldenThrone,
    ]
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

      if (knightCheck === mover && isKnightChecked(gameCopy, mover, horsebackQueenSquare)) {
        // This promotion doesn't resolve an active knight-move check; cancel it.
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
        if (targetPieceBefore.type === 'q') {
          setHorsebackQueenSquare((prev) => ({ ...prev, [lostColor]: null }));
        }
      }

      // A promotion never moves the king, so this is always a "stayed still" turn.
      applyGoldenThrone(mover, false);
      setGame(gameCopy);
      setPendingPromotion(null);

      if (shopArmed) {
        setShopOpenFor(mover);
        setShopArmed(false);
      }
    },
    [pendingPromotion, game, shopArmed, abilities, knightCheck, horsebackQueenSquare, applyGoldenThrone]
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

      // Golden Throne's "king hasn't moved" tracking starts fresh at the
      // moment of purchase, regardless of whether that king already moved
      // earlier in the game (e.g. castled during opening development).
      // This guarantees the purchase is never immediately dead on arrival.
      if (item.id === 'golden-throne') {
        setKingHasMoved((prev) => ({ ...prev, [color]: false }));
      }

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
            if (targetPiece.type === 'q') {
              setHorsebackQueenSquare((prev) => ({ ...prev, [targetPiece.color as Color]: null }));
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
          // Detonating a bishop is never a king move, so this always counts
          // as the king "staying still" for Golden Throne purposes.
          applyGoldenThrone(color, false);
          setGame(new Chess(fenParts.join(' ')));
        }

        setTimeout(() => setExplodingSquares([]), 300);
      }, 250);
    },
    [game, abilities, applyGoldenThrone]
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
    setHorsebackQueenSquare({ w: null, b: null });
    setKingHasMoved({ w: false, b: false });
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
    horsebackQueenSquare,
    knightCheck,
    kingHasMoved,
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