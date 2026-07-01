import { useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';

function App() {
  const [game, setGame] = useState(new Chess());

  function onPieceDrop({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }) {
    if (!targetSquare) return false;

    const gameCopy = new Chess(game.fen());

    try {
      const move = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q',
      });

      if (move === null) return false;

      setGame(gameCopy);
      return true;
    } catch {
      return false;
    }
  }

  function resetGame() {
    setGame(new Chess());
  }

  const chessboardOptions = {
    position: game.fen(),
    onPieceDrop,
  };

  return (
    <div style={{ width: '500px', margin: '40px auto' }}>
      <h1 style={{ textAlign: 'center' }}>Chess Roguelike</h1>
      <Chessboard options={chessboardOptions} />
      <p style={{ textAlign: 'center' }}>
        Turn: {game.turn() === 'w' ? 'White' : 'Black'}
      </p>
      {game.isGameOver() && (
        <p style={{ textAlign: 'center', fontWeight: 'bold' }}>
          {game.isCheckmate()
            ? `Checkmate! ${game.turn() === 'w' ? 'Black' : 'White'} wins.`
            : 'Game over — draw.'}
        </p>
      )}
      <div style={{ textAlign: 'center', marginTop: '10px' }}>
        <button onClick={resetGame}>Reset Board</button>
      </div>
    </div>
  );
}

export default App;