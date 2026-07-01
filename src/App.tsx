import { useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { useChessGame } from './game/useChessGame';
import { allMutators } from './roguelike/mutators';
import { allShopItems } from './roguelike/shop';
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
    onPieceDrop,
    armShop,
    buyItem,
    closeShop,
    detonateBishop,
    resetGame,
  } = useChessGame(activeMutators);

  const turnColor = game.turn();
  const cheapestItemCost = Math.min(...allShopItems.map((item) => item.cost));
  const gameActive = !customGameOver && !game.isGameOver();
  const canArmShop = souls[turnColor] >= cheapestItemCost && !shopOpenFor && gameActive;
  const suicideBishopCharges = abilities[turnColor]['suicide-bishop'] ?? 0;

const explosionStyle: Record<string, React.CSSProperties> = Object.fromEntries(
  explodingSquares.map((square) => [
    square,
    {
      backgroundColor: 'rgba(255, 87, 34, 0.75)',
      transition: 'background-color 0.15s ease-out',
    },
  ])
);

const chessboardOptions = {
  position: game.fen(),
  onPieceDrop,
  squareStyles: explosionStyle,
};

  return (
    <div style={{ width: '520px', margin: '40px auto' }}>
      <h1 style={{ textAlign: 'center' }}>Chess Roguelike</h1>

      <Chessboard options={chessboardOptions} />

      <p style={{ textAlign: 'center' }}>
        Turn: {turnColor === 'w' ? 'White' : 'Black'} | Souls — White: {souls.w}, Black:{' '}
        {souls.b}
      </p>

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

      {gameActive && suicideBishopCharges > 0 && (
        <div
          style={{
            textAlign: 'center',
            marginTop: '10px',
            border: '1px solid #999',
            borderRadius: '6px',
            padding: '8px',
          }}
        >
          <strong>
            Suicide Bishop ready ({suicideBishopCharges} charge
            {suicideBishopCharges > 1 ? 's' : ''})
          </strong>
          <div>
            {ownBishopSquares.map((square) => (
              <button
                key={square}
                style={{ margin: '4px' }}
                onClick={() => detonateBishop(square)}
              >
                Detonate bishop on {square}
              </button>
            ))}
            {ownBishopSquares.length === 0 && <p>No bishops on the board to detonate.</p>}
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: '10px' }}>
        <button onClick={resetGame}>Reset Board</button>
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
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px', width: '320px' }}>
            <h2>Souls Shop — {shopOpenFor === 'w' ? 'White' : 'Black'}</h2>
            <p>Souls available: {souls[shopOpenFor]}</p>
            {allShopItems.map((item) => (
              <div key={item.id} style={{ marginBottom: '12px' }}>
                <strong>{item.name}</strong> — {item.cost} souls
                <p style={{ fontSize: '0.9em', color: '#555' }}>{item.description}</p>
                <button disabled={souls[shopOpenFor] < item.cost} onClick={() => buyItem(item)}>
                  Buy
                </button>
              </div>
            ))}
            <button onClick={closeShop}>Close without buying</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;