export type CardColor = 'red' | 'green' | 'blue' | 'yellow' | 'wild';
export type PlayColor = Exclude<CardColor, 'wild'>;
export type CardType = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export interface Player {
  id: string;
  username: string;
  avatar: string;
  connected: boolean;
  score: number;
}

export interface Card {
  id: string;
  color: CardColor;
  type: CardType;
  value?: number;
}

export interface RuleSet {
  maxPlayers: number;
  turnTimerSeconds: number;
  gameSpeed: 'relaxed' | 'normal' | 'fast';
  stacking: boolean;
  sevenZero: boolean;
  jumpIn: boolean;
  drawToMatch: boolean;
  forcePlay: boolean;
  progressiveDraw: boolean;
  bluffChallenge: boolean;
  scoreLimit: number;
  matchRounds: number;
  unoPenaltyCards: number;
}

export const defaultRuleSet: RuleSet = {
  maxPlayers: 16,
  turnTimerSeconds: 30,
  gameSpeed: 'normal',
  stacking: true,
  sevenZero: false,
  jumpIn: false,
  drawToMatch: false,
  forcePlay: false,
  progressiveDraw: false,
  bluffChallenge: false,
  scoreLimit: 500,
  matchRounds: 1,
  unoPenaltyCards: 2,
};

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface GameState {
  matchId: string;
  seed: string;
  players: Player[];
  rules: RuleSet;
  status: RoomStatus;
  drawPile: Card[];
  discardPile: Card[];
  hands: Record<string, Card[]>;
  activePlayerId: string;
  direction: 1 | -1;
  currentColor: PlayColor;
  pendingDraw: number;
  /** When set, this player just drew a playable card and may play only this card or pass. */
  drawnPlayableOfferId?: string;
  calledUno: Record<string, boolean>;
  eventLog: GameEvent[];
  winnerId?: string;
}

export interface Room {
  id: string;
  inviteToken: string;
  players: Player[];
  rules: RuleSet;
  gameState?: GameState;
  status: RoomStatus;
  createdAt: string;
  expiresAt?: string;
}

export type Move =
  | { type: 'PLAY_CARD'; playerId: string; cardId: string; chosenColor?: PlayColor }
  | { type: 'DRAW_CARD'; playerId: string }
  | { type: 'PASS'; playerId: string }
  | { type: 'CALL_UNO'; playerId: string }
  | { type: 'CHALLENGE'; playerId: string; targetPlayerId: string };

export type GameEventType = Move['type'] | 'SYNC_SNAPSHOT' | 'PLAYER_RECONNECTED';

export interface GameEvent<TPayload = unknown> {
  eventId: string;
  seq: number;
  playerId: string;
  type: GameEventType;
  timestamp: number;
  prevHash?: string;
  hash?: string;
  sig: string;
  payload: TPayload;
}

export interface SignalOffer {
  type: 'offer' | 'answer' | 'ice' | 'peer-joined' | 'peer-left' | 'relay-event';
  roomId: string;
  from: string;
  to?: string;
  payload: unknown;
}

export interface NetworkMetrics {
  rttMs: number;
  packetLoss: number;
  reconnectAttempts: number;
  desyncCount: number;
}

/** Emoji tokens the client picker allows (stored on `Player.avatar`). */
export const AVATAR_EMOJIS = [
  '🦊',
  '🤖',
  '🐼',
  '🐉',
  '🐱',
  '🦉',
  '🎮',
  '🦄',
  '🐸',
  '🦁',
  '🐻',
  '🐨',
  '🦆',
  '🐙',
  '🦋',
  '⭐',
  '🌙',
  '🔥',
  '💜',
  '🍀',
] as const;

const AVATAR_ALLOWED = new Set<string>(AVATAR_EMOJIS as readonly string[]);

/** Older clients stored English keys; tests sometimes use short strings. */
const LEGACY_AVATAR: Record<string, string> = {
  fox: '🦊',
  robot: '🤖',
  panda: '🐼',
  dragon: '🐉',
  cat: '🐱',
  owl: '🦉',
  human: '👤',
};

export function isAllowedAvatar(value: string): boolean {
  return AVATAR_ALLOWED.has(value);
}

export function normalizeStoredAvatar(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  if (AVATAR_ALLOWED.has(s)) return s;
  const mapped = LEGACY_AVATAR[s];
  if (mapped) return mapped;
  return AVATAR_EMOJIS[0];
}

/** Use everywhere you render `Player.avatar` so legacy keys still show as emoji. */
export function displayPlayerAvatar(raw: unknown): string {
  return normalizeStoredAvatar(raw);
}
