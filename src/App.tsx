import { useState, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { useChessGame } from './game/useChessGame';
import { useMultiplayer, type GameAction } from './game/useMultiplayer';
import { allMutators } from './roguelike/mutators';
import { allShopItems } from './roguelike/shop';
console.log('Shop items:', allShopItems);
import type { Mutator } from './roguelike/types';

function App() {
  const [activeMutators] = useState<Mutator[]>(allMutators);
  const {
  game,
  souls,
  abilities,
  shopArmed,
  shopOpenFor,
  customGameOver,
  ownBishopSquares,
  ownRookSquares,           // ADD
  explodingSquares,
  juggernautSweepSquares,   // ADD
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
  activateJuggernaut,       // ADD
  choosePromotion,
  resetGame,
} = useChessGame(activeMutators);
  const multiplayer = useMultiplayer();
  const turnColor = game.turn();

  // Applies an action that arrived from the peer by calling the exact same
  // local function the acting player used. Both browsers run identical,
  // deterministic game logic, so replaying the same inputs lands on
  // identical state - this mirrors how hotseat mode already works, just
  // with the "other player" arriving over the network instead of sharing
  // a screen.
  useEffect(() => {
    if (!multiplayer.lastReceivedAction) return;
    const action = multiplayer.lastReceivedAction.action;
    switch (action.type) {
      case 'onPieceDrop':
        onPieceDrop({ sourceSquare: action.sourceSquare, targetSquare: action.targetSquare });
        break;
      case 'detonateBishop':
        detonateBishop(action.square);
        break;
      case 'activateJuggernaut':
        activateJuggernaut(action.rookSquare, action.direction);
        break;
      case 'choosePromotion':
        choosePromotion(action.pieceType);
        break;
      case 'skipBonusMove':
        skipBonusMove();
        break;
      case 'buyItem': {
        const item = allShopItems.find((i) => i.id === action.itemId);
        if (item) buyItem(item, action.buyerColor);
        break;
      }
      case 'resetGame':
        resetGame();
        break;
    }
    // Intentionally only re-runs when a new action actually arrives (keyed
    // by seq), not on every render or every game-logic function identity
    // change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiplayer.lastReceivedAction]);

  const sendIfMultiplayer = (action: GameAction) => {
    if (multiplayer.isMultiplayer) multiplayer.sendAction(action);
  };

  // Wrapped versions of every state-mutating action: each checks turn
  // ownership first (in multiplayer only - hotseat mode is unaffected),
  // then performs the action locally exactly as before, then broadcasts it
  // to the peer so their board updates too.
  const handlePieceDrop = ({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }) => {
    if (!targetSquare) return false;
    if (!multiplayer.isMyTurn(turnColor)) return false;
    const result = onPieceDrop({ sourceSquare, targetSquare });
    if (result) sendIfMultiplayer({ type: 'onPieceDrop', sourceSquare, targetSquare });
    return result;
  };

  const handleDetonateBishop = (square: string) => {
    if (!multiplayer.isMyTurn(turnColor)) return;
    detonateBishop(square);
    sendIfMultiplayer({ type: 'detonateBishop', square });
  };

  const handleActivateJuggernaut = (
    rookSquare: string,
    direction: 'up' | 'down' | 'left' | 'right'
  ) => {
    if (!multiplayer.isMyTurn(turnColor)) return;
    activateJuggernaut(rookSquare, direction);
    sendIfMultiplayer({ type: 'activateJuggernaut', rookSquare, direction });
  };

  const handleChoosePromotion = (pieceType: 'q' | 'r' | 'b' | 'n') => {
    if (!multiplayer.isMyTurn(turnColor)) return;
    choosePromotion(pieceType);
    sendIfMultiplayer({ type: 'choosePromotion', pieceType });
  };

  const handleSkipBonusMove = () => {
    if (!multiplayer.isMyTurn(turnColor)) return;
    skipBonusMove();
    sendIfMultiplayer({ type: 'skipBonusMove' });
  };

  const handleBuyItem = (item: (typeof allShopItems)[number]) => {
    buyItem(item);
    if (multiplayer.myColor) {
      sendIfMultiplayer({ type: 'buyItem', itemId: item.id, buyerColor: multiplayer.myColor });
    }
  };

  const handleResetGame = () => {
    resetGame();
    sendIfMultiplayer({ type: 'resetGame' });
  };
  const cheapestItemCost = Math.min(...allShopItems.map((item) => item.cost));
  const gameActive = !customGameOver && !game.isGameOver();
  const canArmShop =
    souls[turnColor] >= cheapestItemCost &&
    !shopOpenFor &&
    gameActive &&
    multiplayer.isMyTurn(turnColor);

  const suicideBishopCharges = abilities[turnColor]['suicide-bishop'] ?? 0;
  const explosionStyle: Record<string, React.CSSProperties> = Object.fromEntries(
  explodingSquares.map((square) => [
    square,
    {
      backgroundColor: 'rgba(18, 4, 218, 0.75)',
      transition: 'background-color 0.15s ease-out',
    },
  ])
)
  const juggernautCharges = abilities[turnColor]['juggernaut'] ?? 0;
  const juggernautStyle: Record<string, React.CSSProperties> = Object.fromEntries(
  juggernautSweepSquares.map((square) => [
    square,
    {
      backgroundColor: 'rgba(235, 89, 5, 0.87)',
      transition: 'background-color 0.15s ease-out',
    },
  ])
);

const chessboardOptions = {
  position: game.fen(),
  onPieceDrop: handlePieceDrop,
  squareStyles: { ...explosionStyle, ...juggernautStyle },
  // Local hotseat always shows White at the bottom (both players share the
  // screen, so there's no single "my side"). In multiplayer, each browser
  // shows its own player's color at the bottom.
  boardOrientation: (multiplayer.isMultiplayer && multiplayer.myColor === 'b'
    ? 'black'
    : 'white') as 'white' | 'black',
};
;



  // Pre-game screen: shown until either the player picks local hotseat
  // (default, status stays 'idle') or a multiplayer connection is fully
  // established. Joining as guest happens automatically (via the ?room=
  // link) inside useMultiplayer, so 'connecting' here only ever applies
  // to the guest.
  if (multiplayer.status !== 'idle' && multiplayer.status !== 'connected') {
    return (
      <div style={{ width: '420px', margin: '80px auto', textAlign: 'center' }}>
        <h1>Chess Roguelike</h1>
        {multiplayer.status === 'waiting-for-peer' && (
          <>
            <p>Send this link to your friend:</p>
            <input
              readOnly
              value={multiplayer.roomLink ?? 'Generating link...'}
              style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
              onFocus={(e) => e.target.select()}
            />
            {multiplayer.roomLink && (
              <button onClick={() => navigator.clipboard.writeText(multiplayer.roomLink!)}>
                Copy link
              </button>
            )}
            <p style={{ color: '#555', fontStyle: 'italic' }}>
              Waiting for your friend to open it... (you're {multiplayer.myColor === 'w' ? 'White' : 'Black'})
            </p>
          </>
        )}
        {multiplayer.status === 'connecting' && <p>Connecting to your friend's game...</p>}
        {multiplayer.status === 'peer-disconnected' && (
          <p style={{ color: 'crimson' }}>Your friend disconnected. Reload to start a new game.</p>
        )}
        {multiplayer.status === 'error' && (
          <>
            <p style={{ color: 'crimson' }}>{multiplayer.errorMessage}</p>
            <button onClick={() => window.location.reload()}>Reload</button>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ width: '520px', margin: '40px auto' }}>

{multiplayer.status === 'idle' && (
  <div style={{ textAlign: 'center', marginBottom: '10px' }}>
    <p style={{ fontWeight: 'bold', marginBottom: '4px' }}>Play Online (create link for a friend)</p>
    <button onClick={() => multiplayer.createGame('w')} style={{ marginRight: '6px' }}>
      Play as White
    </button>
    <button onClick={() => multiplayer.createGame('b')}>Play as Black</button>
  </div>
)}

{multiplayer.isMultiplayer && (
  <p style={{ textAlign: 'center', fontWeight: 'bold' }}>
    You are {multiplayer.myColor === 'w' ? 'White' : 'Black'} —{' '}
    {turnColor === multiplayer.myColor ? "it's your turn" : "waiting for your friend's move"}
  </p>
)}

{rookSacrificeBanner && (
  <div
    style={{
      position: 'fixed',
      top: '30%',
      left: 0,
      width: '100%',
      textAlign: 'center',
      fontSize: '3em',
      fontWeight: 'bold',
      color: 'crimson',
      textShadow: '2px 2px 4px black',
      pointerEvents: 'none',
      zIndex: 1000,
    }}
  >
    THE ROOOOOOOOOOK!!!
  </div>
)}

      <h1 style={{ textAlign: 'center' }}>Chess Roguelike</h1>

      <Chessboard options={chessboardOptions} />

      <p style={{ textAlign: 'center' }}>
        Turn: {turnColor === 'w' ? 'White' : 'Black'} | Souls — White: {souls.w}, Black:{' '}
        {souls.b}
      </p>

      {(abilities[turnColor]['backward-pawn'] ?? 0) > 0 && gameActive && (
  <p style={{ textAlign: 'center', fontStyle: 'italic', color: '#555' }}>
    Retreating Pawns active — your pawns can step back one square.
  </p>
)}

      {(abilities[turnColor]['golden-throne'] ?? 0) > 0 && gameActive && (
  <p
    style={{
      textAlign: 'center',
      fontStyle: 'italic',
      color: kingHasMoved[turnColor] ? '#999' : '#b8860b',
    }}
  >
    {kingHasMoved[turnColor]
      ? 'Golden Throne broken — your king has already moved.'
      : 'Golden Throne active — +1 soul each turn your king stays still.'}
  </p>
)}

      {!customGameOver && game.isGameOver() && (
        <p style={{ textAlign: 'center', fontWeight: 'bold' }}>
          {game.isCheckmate()
            ? `Checkmate! ${turnColor === 'w' ? 'Black' : 'White'} wins.`
            : 'Game over — draw.'}
        </p>
      )}

      {customGameOver && (
        <p style={{ textAlign: 'center', fontWeight: 'bold', color: 'crimson' }}>
          {customGameOver.reason}
          {customGameOver.winner === 'w' ? 'White' : 'Black'} wins!
        </p>
      )}

      {gameActive && (
        <div style={{ textAlign: 'center', marginTop: '10px' }}>
          <button onClick={armShop} disabled={!canArmShop && !shopArmed}>
            {shopArmed
              ? 'Shop armed — opens after your move (click to cancel)'
              : 'Use Souls Shop (opens after your move)'}
          </button>
        </div>
      )}

      {gameActive && suicideBishopCharges > 0 && multiplayer.isMyTurn(turnColor) && (
  <div
    style={{
      textAlign: 'center',
      marginTop: '10px',
      border: '1px solid #999',
      borderRadius: '6px',
      padding: '8px',
    }}
  >
    <strong>Suicide Bishops active</strong>
    <div>
      {ownBishopSquares.map((square) => (
        <button
          key={square}
          style={{ margin: '4px' }}
          onClick={() => handleDetonateBishop(square)}
        >
          Detonate bishop on {square}
        </button>
      ))}
      {ownBishopSquares.length === 0 && <p>No bishops on the board to detonate.</p>}
    </div>
  </div>
)}

{gameActive && juggernautCharges > 0 && multiplayer.isMyTurn(turnColor) && (
  <div
    style={{
      textAlign: 'center',
      marginTop: '10px',
      border: '1px solid #999',
      borderRadius: '6px',
      padding: '8px',
    }}
  >
    <strong>Juggernaut active</strong>
    {ownRookSquares.length === 0 && <p>No rooks on the board to charge.</p>}
    {ownRookSquares.map((square) => (
      <div key={square} style={{ margin: '6px 0' }}>
        <span style={{ marginRight: '8px' }}>{square}:</span>
        <button style={{ margin: '2px' }} onClick={() => handleActivateJuggernaut(square, 'up')}>Up</button>
        <button style={{ margin: '2px' }} onClick={() => handleActivateJuggernaut(square, 'down')}>Down</button>
        <button style={{ margin: '2px' }} onClick={() => handleActivateJuggernaut(square, 'left')}>Left</button>
        <button style={{ margin: '2px' }} onClick={() => handleActivateJuggernaut(square, 'right')}>Right</button>
      </div>
    ))}
  </div>
)}

      <div style={{ textAlign: 'center', marginTop: '10px' }}>
        <button onClick={handleResetGame}>Reset Board</button>
      </div>

      {shopOpenFor && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ 
            background: 'white',
            padding: '20px',
            borderRadius: '8px', 
            width: '320px', 
            maxHeight: '80vh',       // FIX: Limits height to 80% of the viewport
            overflowY: 'auto',       // FIX: Adds a scrollbar if items overflow
            }}>
            <h2>Souls Shop — {shopOpenFor === 'w' ? 'White' : 'Black'}</h2>
            <p>Souls available: {souls[shopOpenFor]}</p>
            {allShopItems.map((item) => {
             const alreadyOwned = (abilities[shopOpenFor][item.id] ?? 0) > 0;
             return (
              <div key={item.id} style={{ marginBottom: '12px' }}>
              <strong>{item.name}</strong> — {item.cost} souls
               <p style={{ fontSize: '0.9em', color: '#555' }}>{item.description}</p>
                {alreadyOwned ? (
                <p style={{ fontStyle: 'italic', color: '#888' }}>Already owned</p>
                   ) : (
                  <button disabled={souls[shopOpenFor] < item.cost} onClick={() => handleBuyItem(item)}>
                   Buy
                  </button>
                    )}
               </div>
                );
              })}
            <button onClick={closeShop}>Close without buying</button>
          </div>
        </div>
      )}

{pendingPromotion && (
  <div
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <div style={{ background: 'white', padding: '20px', borderRadius: '8px' }}>
      <h2>Promote pawn to:</h2>
      {multiplayer.isMyTurn(turnColor) ? (
        <>
          <button onClick={() => handleChoosePromotion('q')} style={{ margin: '4px' }}>Queen</button>
          <button onClick={() => handleChoosePromotion('r')} style={{ margin: '4px' }}>Rook</button>
          <button onClick={() => handleChoosePromotion('b')} style={{ margin: '4px' }}>Bishop</button>
          <button onClick={() => handleChoosePromotion('n')} style={{ margin: '4px' }}>Knight</button>
        </>
      ) : (
        <p>Waiting for your friend to choose...</p>
      )}
    </div>
  </div>
)}

{horsebackQueenSquare[turnColor] && gameActive && (
  <p style={{ textAlign: 'center', fontStyle: 'italic', color: '#555' }}>
    Your queen on {horsebackQueenSquare[turnColor]} can also move like a knight.
  </p>
)}

{knightCheck && !customGameOver && (
  <p style={{ textAlign: 'center', fontWeight: 'bold', color: 'darkorange' }}>
    {knightCheck === 'w' ? "White's" : "Black's"} king is in check from a knight-move queen attack!
  </p>
)}

{bonusMoveAvailable && (
  <div
    style={{
      textAlign: 'center',
      marginTop: '10px',
      border: '1px solid #999',
      borderRadius: '6px',
      padding: '8px',
    }}
  >
    <strong>Bonus move! Move your knight on {bonusMoveAvailable.square}, or skip it.</strong>
    {multiplayer.isMyTurn(turnColor) ? (
      <div>
        <button onClick={handleSkipBonusMove} style={{ margin: '4px' }}>
          Skip Bonus Move
        </button>
      </div>
    ) : (
      <p>Waiting for your friend...</p>
    )}
  </div>
)}


    </div>
  );
}

export default App;
