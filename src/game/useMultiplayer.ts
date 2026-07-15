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

// Internal wire format. 'assignColor' is a one-time handshake message sent
// by the host right after connecting, telling the guest which color they
// got (the opposite of whatever the host chose). 'action' wraps every
// normal GameAction. Keeping these distinct means App.tsx's action-replay
// logic never has to know about the handshake at all.
type WireMessage = { kind: 'assignColor'; color: Color } | { kind: 'action'; action: GameAction };

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

  // isHost + hostColor are only meaningful for the host's own outgoing
  // connection: right when the guest connects, the host immediately tells
  // them which color they got (whichever one the host didn't pick).
  const wireConnection = useCallback((conn: DataConnection, isHost: boolean, hostColor?: Color) => {
    connRef.current = conn;
    conn.on('open', () => {
      if (isHost && hostColor) {
        const guestColor: Color = hostColor === 'w' ? 'b' : 'w';
        conn.send({ kind: 'assignColor', color: guestColor } satisfies WireMessage);
        setStatus('connected');
      }
      // Guest doesn't flip to 'connected' here - it waits for the
      // 'assignColor' message below, so myColor and status become correct
      // at the same moment (never a flash of "connected" with no color).
    });
    conn.on('data', (data) => {
      const msg = data as WireMessage;
      if (msg.kind === 'assignColor') {
        setMyColor(msg.color);
        setStatus('connected');
        return;
      }
      seqRef.current += 1;
      setLastReceivedAction({ seq: seqRef.current, action: msg.action });
    });
    conn.on('close', () => setStatus('peer-disconnected'));
    conn.on('error', () => setStatus('error'));
  }, []);

  // Host flow: create a peer, pick your color, wait for the guest to
  // connect. Whichever color the host doesn't pick becomes the guest's.
  const createGame = useCallback(
    (chosenColor: Color) => {
      setStatus('waiting-for-peer');
      setMyColor(chosenColor);
      setErrorMessage(null);

      const peer = new Peer();
      peerRef.current = peer;

      peer.on('open', (id) => {
        const url = new URL(window.location.href);
        url.searchParams.set(ROOM_PARAM, id);
        setRoomLink(url.toString());
      });

      peer.on('connection', (conn) => {
        wireConnection(conn, true, chosenColor);
      });

      peer.on('error', (err) => {
        console.error('Peer error (host):', err);
        setErrorMessage('Connection error - try creating a new game.');
        setStatus('error');
      });
    },
    [wireConnection]
  );

  // Guest flow: create your own peer, then connect directly to the host's
  // peer id (the room code from the link). Color isn't known yet - it
  // arrives via the 'assignColor' handshake message once connected.
  const joinGame = useCallback(
    (roomId: string) => {
      setStatus('connecting');
      setMyColor(null);
      setErrorMessage(null);

      const peer = new Peer();
      peerRef.current = peer;

      peer.on('open', () => {
        const conn = peer.connect(roomId, { reliable: true });
        wireConnection(conn, false);
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
      connRef.current.send({ kind: 'action', action } satisfies WireMessage);
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