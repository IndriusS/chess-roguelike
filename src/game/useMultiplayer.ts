import { useState, useCallback, useEffect, useRef } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import type { Color } from './useChessGame';

// One entry per user-triggered action in useChessGame that mutates game
// state. Each variant's payload is exactly the arguments that function
// takes. When an action arrives from the peer, App.tsx replays it through
// the exact same local function the acting player used - so both sides
// run identical, deterministic logic and land on identical state.
export type GameAction =
  | { type: 'onPieceDrop'; sourceSquare: string; targetSquare: string }
  | { type: 'detonateBishop'; square: string }
  | { type: 'activateJuggernaut'; rookSquare: string; direction: 'up' | 'down' | 'left' | 'right' }
  | { type: 'choosePromotion'; pieceType: 'q' | 'r' | 'b' | 'n' }
  | { type: 'skipBonusMove' }
  | { type: 'buyItem'; itemId: string; buyerColor: Color }
  | { type: 'resetGame' };

export type ConnectionStatus =
  | 'idle'
  | 'waiting-for-peer' // host: peer created, link ready, nobody's joined yet
  | 'connecting' // guest: attempting to connect to host's room
  | 'connected'
  | 'peer-disconnected'
  | 'error';

const ROOM_PARAM = 'room';

export function useMultiplayer() {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [myColor, setMyColor] = useState<Color | null>(null);
  const [roomLink, setRoomLink] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Bumped on every inbound action so App.tsx's effect fires even if two
  // actions in a row happen to be structurally identical.
  const [lastReceivedAction, setLastReceivedAction] = useState<{
    seq: number;
    action: GameAction;
  } | null>(null);

  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<DataConnection | null>(null);
  const seqRef = useRef(0);

  const wireConnection = useCallback((conn: DataConnection) => {
    connRef.current = conn;
    conn.on('open', () => setStatus('connected'));
    conn.on('data', (data) => {
      seqRef.current += 1;
      setLastReceivedAction({ seq: seqRef.current, action: data as GameAction });
    });
    conn.on('close', () => setStatus('peer-disconnected'));
    conn.on('error', () => setStatus('error'));
  }, []);

  // Host flow: create a peer, become White, wait for the guest to connect.
  const createGame = useCallback(() => {
    setStatus('waiting-for-peer');
    setMyColor('w');
    setErrorMessage(null);

    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => {
      const url = new URL(window.location.href);
      url.searchParams.set(ROOM_PARAM, id);
      setRoomLink(url.toString());
    });

    peer.on('connection', (conn) => {
      wireConnection(conn);
    });

    peer.on('error', (err) => {
      console.error('Peer error (host):', err);
      setErrorMessage('Connection error - try creating a new game.');
      setStatus('error');
    });
  }, [wireConnection]);

  // Guest flow: create your own peer, then connect directly to the host's
  // peer id (the room code from the link).
  const joinGame = useCallback(
    (roomId: string) => {
      setStatus('connecting');
      setMyColor('b');
      setErrorMessage(null);

      const peer = new Peer();
      peerRef.current = peer;

      peer.on('open', () => {
        const conn = peer.connect(roomId, { reliable: true });
        wireConnection(conn);
      });

      peer.on('error', (err) => {
        console.error('Peer error (guest):', err);
        setErrorMessage('Could not connect - check the link and that your friend has the game open.');
        setStatus('error');
      });
    },
    [wireConnection]
  );

  // If the page was opened with ?room=<id>, auto-join as guest on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get(ROOM_PARAM);
    if (roomId) {
      joinGame(roomId);
    }
    // Only ever run this once, on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      connRef.current?.close();
      peerRef.current?.destroy();
    };
  }, []);

  const sendAction = useCallback((action: GameAction) => {
    if (connRef.current && connRef.current.open) {
      connRef.current.send(action);
    }
  }, []);

  const isMultiplayer = status !== 'idle';
  const isMyTurn = useCallback(
    (turnColor: Color) => !isMultiplayer || myColor === turnColor,
    [isMultiplayer, myColor]
  );

  return {
    status,
    myColor,
    roomLink,
    errorMessage,
    isMultiplayer,
    isMyTurn,
    lastReceivedAction,
    createGame,
    joinGame,
    sendAction,
  };
}
