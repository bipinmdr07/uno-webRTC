<script setup lang="ts">
import ConfettiExplosion from 'vue-confetti-explosion';
import { useDocumentVisibility, usePreferredReducedMotion, useWindowSize } from '@vueuse/core';
import { ChevronLeft, ChevronRight, Loader2, PartyPopper } from 'lucide-vue-next';
import { nextTick, onBeforeMount, onMounted, onUnmounted, toRaw, watch } from 'vue';
import { toast } from 'vue-sonner';
import { DirectionArrow, HandRail, PlayerPanel, UnoButton, UnoCardFace } from '@uno/ui';
import { canCallUno, finishedRoundStandings, firstPlayerIdForNextRound } from '@uno/game-engine';
import {
  displayPlayerAvatar,
  type Card,
  type GameEvent,
  type GameState,
  type Move,
  type PlayColor,
  type Player,
  type Room,
  type SignalOffer,
} from '@uno/shared-types';
import type { RelayPayload } from '~/stores/network';
import type { SignalingIoTransport } from '@uno/network';

const route = useRoute();
const config = useRuntimeConfig();
const identity = useIdentityStore();
const match = useMatchStore();
const network = useNetworkStore();

const roomId = computed(() => String(route.params.id));

const room = ref<Room | null>(null);
const joinError = ref<string | null>(null);
const startError = ref<string | null>(null);
// Invitees with ?token= hit the profile gate first — they must not inherit a "joining" spinner before
// mount runs; tunnel/CF script errors can block onMounted and leave that stuck forever.
const joining = ref(false);
const starting = ref(false);
// Start false on SSR and on first client tick so hydration never disagrees with sessionStorage;
// sync the real flag in onBeforeMount before the join gate in onMounted runs.
const joinProfileReady = ref(false);
const joinNameError = ref<string | null>(null);

const router = useRouter();

function joinProfileStorageKey(): string {
  return `uno.roomJoinProfile:${roomId.value}`;
}

/** Invite links ask for name/avatar first; host skips via ?from=create, everyone skips after a successful join in this browser tab. */
const showJoinProfileForm = computed(() => {
  const token = tokenFromQuery();
  if (!token || room.value) return false;
  if (route.query.from === 'create') return false;
  return !joinProfileReady.value;
});

const trimmedJoinName = computed(() => identity.displayName.trim());

function onJoinDisplayNameInput(v: string | number) {
  identity.displayName = String(v);
  joinNameError.value = null;
}

function validateJoinName(): boolean {
  if (!trimmedJoinName.value) {
    joinNameError.value = 'Pick a display name so the lobby shows the right person.';
    return false;
  }
  if (trimmedJoinName.value.length > 32) {
    joinNameError.value = 'Keep it under 32 characters so it fits in the lobby.';
    return false;
  }
  joinNameError.value = null;
  return true;
}

function stripFromCreateQuery() {
  if (route.query.from !== 'create') return;
  const { from: _from, ...rest } = route.query;
  void router.replace({ path: route.path, query: rest });
}

// Wild cards are special: the move is otherwise valid, but the player still needs to
// pick the color the next turn must match. We park the partly-built move here while the
// color picker is open and finalize it once the user clicks a color (or cancels).
type WildPlayMove = Extract<Move, { type: 'PLAY_CARD' }>;
/** Tracks whether we paused on a Wild Draw Four while the player picks the color that follows on the pile. */
const pendingWild = ref<{ move: WildPlayMove; wildDrawFour: boolean } | null>(null);

const wildDialogOpen = computed({
  get: () => pendingWild.value != null,
  set(open: boolean) {
    if (!open) cancelColorPick();
  },
});

const colorPalette: { id: PlayColor; label: string; swatch: string }[] = [
  { id: 'red', label: 'Red', swatch: '#ef4444' },
  { id: 'yellow', label: 'Yellow', swatch: '#eab308' },
  { id: 'green', label: 'Green', swatch: '#22c55e' },
  { id: 'blue', label: 'Blue', swatch: '#3b82f6' },
];

/** Vue Router can give `token` as a string or string[] when the query is duplicated. */
function tokenFromQuery(): string {
  const raw = route.query.token;
  if (raw == null) return '';
  return Array.isArray(raw) ? String(raw[0] ?? '') : String(raw);
}

/** Invite JWT from the URL, or whatever the server last returned on the room payload. */
const inviteToken = computed(() => tokenFromQuery() || room.value?.inviteToken || '');

const inviteFullUrl = computed(() => {
  if (!import.meta.client) return '';
  const t = inviteToken.value;
  if (!t) return '';
  return `${window.location.origin}/room/${roomId.value}?token=${encodeURIComponent(t)}`;
});

const isHost = computed(() => room.value?.players[0]?.id === identity.playerId);

const canStart = computed(() => {
  const r = room.value;
  if (!r) return false;
  return r.players.length >= 2;
});

const isMyTurn = computed(
  () => match.state != null && match.state.status === 'playing' && match.state.activePlayerId === identity.playerId,
);

const { width: winW, height: winH } = useWindowSize();
const confettiStageWidth = computed(() => Math.min(Math.max(winW.value, 360), 960));
const confettiStageHeight = computed(() => Math.min(Math.max(winH.value, 640), 1200));
const prefersReducedMotion = usePreferredReducedMotion();
const docVisibility = useDocumentVisibility();

watch(
  docVisibility,
  (v) => {
    if (!import.meta.client) return;
    document.documentElement.classList.toggle('uno-tab-hidden', v === 'hidden');
  },
  { immediate: true },
);

/** Cheaper bursts on phones / low core count; zero when the OS asks for reduced motion. */
const confettiParticleCount = computed(() => {
  if (prefersReducedMotion.value) return 0;
  const w = winW.value;
  const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4;
  if (w < 480 || cores <= 4) return 64;
  if (w < 900 || cores <= 8) return 110;
  return 160;
});

const confettiForce = computed(() => (winW.value < 480 ? 0.36 : 0.48));

const showVictoryConfetti = ref(false);
const confettiPalette: string[] = ['#a786ff', '#fd8bbc', '#f97316', '#facc15', '#38bdf8', '#34d399'];

const gameOverStandings = computed(() => {
  const s = match.state;
  if (!s || s.status !== 'finished') return [];
  return finishedRoundStandings(s);
});

const winnerPlayer = computed<Player | null>(() => {
  const s = match.state;
  if (!s?.winnerId) return null;
  return s.players.find((p) => p.id === s.winnerId) ?? null;
});

/** Who gets the first turn after the host deals again (one seat past the winner, following play direction). */
const nextRoundOpener = computed(() => {
  const s = match.state;
  if (!s || s.status !== 'finished') return null;
  const id = firstPlayerIdForNextRound(s);
  return s.players.find((p) => p.id === id) ?? null;
});

/** Chevron icon + motion class for the in-match “Players” heading (follows `match.state.direction`). */
const turnDirChevron = computed(() => (match.state?.direction === 1 ? ChevronRight : ChevronLeft));
const turnDirAnimClass = computed(() =>
  match.state?.direction === 1
    ? 'uno-decorative-anim animate-[uno-dir-cw_0.85s_ease-in-out_infinite]'
    : 'uno-decorative-anim animate-[uno-dir-ccw_0.85s_ease-in-out_infinite]',
);

const gameOverDismissed = ref(false);

watch(
  () => match.state?.status,
  (status, prev) => {
    if (status !== 'finished') return;
    gameOverDismissed.value = false;
    // Only celebrate on a live finish so refreshing an already-ended match doesn’t replay the effect.
    if (prev === 'playing') void triggerVictoryConfetti();
  },
);

const gameOverDialogOpen = computed({
  get: () => match.state?.status === 'finished' && !gameOverDismissed.value,
  set(open: boolean) {
    if (!open) gameOverDismissed.value = true;
  },
});

/** Remount the explosion component so vue-confetti-explosion runs a fresh burst for everyone. */
async function triggerVictoryConfetti() {
  if (prefersReducedMotion.value || confettiParticleCount.value <= 0) return;
  showVictoryConfetti.value = false;
  await nextTick();
  showVictoryConfetti.value = true;
}

/** You can tap UNO with one card left, or with two on your turn if something is playable — but only until you’ve declared for this streak. */
const canPressUno = computed(() => {
  const s = match.state;
  if (!s || s.status !== 'playing') return false;
  const pid = identity.playerId;
  return canCallUno(s, pid) && !s.calledUno[pid];
});

/** Nothing in hand can be played — the only legal move is to draw from the deck. */
const mustDrawNoPlayable = computed(() => {
  if (!isMyTurn.value || match.state?.status !== 'playing') return false;
  const moves = match.legal(identity.playerId);
  return moves.length > 0 && !moves.some((m) => m.type === 'PLAY_CARD');
});

/** Just drew something that matches the pile — you can play that card or pass and end your turn. */
const drawnPlayableOffer = computed(() => {
  const s = match.state;
  if (!s || s.status !== 'playing' || s.activePlayerId !== identity.playerId) return false;
  return Boolean(s.drawnPlayableOfferId);
});

/** How many cards you take if you press Draw during a +2 / Wild +4 stack (stacking rules). */
const pendingStackDraw = computed(() => {
  const s = match.state;
  if (!s || s.pendingDraw <= 0) return 0;
  return s.pendingDraw;
});

const topDiscard = computed(() => match.state?.discardPile.at(-1) ?? null);

const deckCount = computed(() => match.state?.drawPile.length ?? 0);

const activeColorStyle = computed(() => {
  const c = match.state?.currentColor;
  if (!c) return { background: '#64748b' };
  const map: Record<PlayColor, string> = {
    red: '#ef4444',
    blue: '#3b82f6',
    green: '#22c55e',
    yellow: '#eab308',
  };
  return { background: map[c] };
});

const wildDialogTitle = computed(() => {
  const p = pendingWild.value;
  if (!p) return 'Choose the next color';
  return p.wildDrawFour ? 'Wild Draw Four — choose the next color' : 'Wild card — choose the next color';
});

const wildDialogDescription = computed(() => {
  const pending = pendingWild.value;
  if (!pending) return '';
  const s = match.state;
  const seats = s?.players.length ?? 0;
  const stacking = s?.rules.stacking ?? true;
  if (pending.wildDrawFour && stacking) {
    return 'Adds four to the running draw stack — the next player may stack only another Wild +4 (not +2), or use the pile button to take every stacked card at once.';
  }
  if (pending.wildDrawFour && seats === 2) {
    return 'Your opponent draws four and is skipped. With only two players that means you go again after you pick a color.';
  }
  if (pending.wildDrawFour) {
    return 'The next player draws four and is skipped; the player after them must match the color you pick.';
  }
  return 'The next player takes a turn and must match the color you pick.';
});

let pollTimer: ReturnType<typeof setInterval> | undefined;

function handleSignal(signal: SignalOffer) {
  // A peer connecting (or reconnecting after a refresh) gets a targeted snapshot from us.
  // When comparing broadcast snapshots, only trust a longer event log if the shuffle seed
  // matches — otherwise a peer still holding the last hand can overwrite the host’s new
  // deal (long finished log vs empty log) and the room looks “disconnected” until someone
  // refreshes and resyncs.
  if (signal.type === 'peer-joined') {
    if (match.state) network.relaySnapshot(toRaw(match.state) as GameState, signal.from);
    return;
  }
  if (signal.type !== 'relay-event') return;
  const payload = signal.payload as RelayPayload | undefined;
  if (!payload) return;
  if (signal.to && signal.to !== identity.playerId) return; // snapshot targeted at someone else
  if (payload.kind === 'event') {
    match.applyRemoteEvent(payload.event as GameEvent<Move>);
  } else if (payload.kind === 'snapshot') {
    const incoming = payload.state;
    const local = match.state;
    if (local == null) {
      match.loadSnapshot(incoming);
      return;
    }
    const localSeq = local.eventLog.length;
    const incomingSeq = incoming.eventLog.length;
    // A new deal always uses a new seed (see startNextRound). If we only accepted empty logs
    // when local was finished, anyone still marked "playing" from a stale tab or missed end
    // would reject the snapshot — then the host's first move can't be applied and nobody's
    // activePlayerId matches their seat, so every client shows "waiting for your turn".
    const isFreshDeal = incoming.status === 'playing' && incomingSeq === 0;
    const newShuffle = incoming.seed !== local.seed;
    const acceptNewDeal = isFreshDeal && (local.status === 'finished' || newShuffle);
    const sameDeal = incoming.seed === local.seed;
    const acceptLongerLog = sameDeal && incomingSeq > localSeq;
    if (acceptNewDeal || acceptLongerLog) match.loadSnapshot(incoming);
  }
}

let warnedTunnelSignaling = false;

/**
 * Where socket.io should connect. An explicit `NUXT_PUBLIC_SIGNALING_URL` wins; otherwise
 * we point at the Fastify port (4100) on whatever hostname the page is being served from.
 * This avoids routing WebSocket upgrades through Nuxt's dev server, which can't proxy
 * them reliably and was crash-restarting on every failed upgrade.
 *
 * Cloudflare: the page hostname almost never exposes :4100, and a "TCP" published app is
 * not a URL the browser can use for Socket.IO — add a second *HTTP* hostname to the tunnel
 * for `http://127.0.0.1:4100` and set `NUXT_PUBLIC_SIGNALING_URL` to that https origin.
 */
function resolveSignalingUrl(): string {
  const configured = String(config.public.signalingUrl ?? '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  const { protocol, hostname } = window.location;
  const looksLikeLanOrLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    /^(\d+\.){3}\d+$/.test(hostname);
  const defaultTlsPort = protocol === 'https:' && !window.location.port;
  if (
    import.meta.dev &&
    !warnedTunnelSignaling &&
    defaultTlsPort &&
    !looksLikeLanOrLocal
  ) {
    warnedTunnelSignaling = true;
    console.warn(
      '[uno] NUXT_PUBLIC_SIGNALING_URL is unset; using',
      `${protocol}//${hostname}:4100`,
      'for Socket.IO — that port is usually not reachable on the public hostname. Point an HTTP tunnel hostname at :4100 (not TCP) and set NUXT_PUBLIC_SIGNALING_URL to that https origin.',
    );
  }
  return `${protocol}//${hostname}:4100`;
}

function parseSignalingTransports(): SignalingIoTransport[] | undefined {
  const raw = String(config.public.signalingTransports ?? '').trim();
  if (!raw) return undefined;
  const out: SignalingIoTransport[] = [];
  for (const part of raw.split(',')) {
    const t = part.trim();
    if (t === 'polling' || t === 'websocket') out.push(t);
  }
  return out.length ? out : undefined;
}

function connectSignaling() {
  network.connect(resolveSignalingUrl(), roomId.value, identity.playerId, handleSignal, {
    transports: parseSignalingTransports(),
  });
}

function beginMatch(r: Room) {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
  match.room = r;
  // Try to restore the in-progress match from this tab first; only deal a fresh game
  // if we have nothing cached, otherwise a refresh would reset everyone to turn 1.
  if (!match.hydrate(r.id)) match.startLocal(r.players);
  connectSignaling();
}

async function refreshRoom() {
  if (!room.value || room.value.status !== 'lobby') return;
  try {
    const next = await $fetch<Room>(`${config.public.apiBase}/rooms/${roomId.value}`);
    room.value = next;
    if (next.status === 'playing' && !match.state) beginMatch(next);
  } catch {
    /* transient network errors — next poll will retry */
  }
}

async function copyInviteLink() {
  const t = inviteToken.value;
  if (!t) return;
  const url = `${window.location.origin}/room/${roomId.value}?token=${encodeURIComponent(t)}`;
  await navigator.clipboard.writeText(url);
  toast.success('Invite link copied');
}

async function startGame() {
  const t = inviteToken.value;
  if (!room.value || !t) return;
  startError.value = null;
  starting.value = true;
  try {
    const updated = await $fetch<Room>(`${config.public.apiBase}/rooms/${roomId.value}/start`, {
      method: 'POST',
      body: { token: t, playerId: identity.playerId },
    });
    room.value = updated;
    if (updated.status === 'playing') beginMatch(updated);
  } catch (e: unknown) {
    const msg = typeof e === 'object' && e !== null && 'data' in e && typeof (e as { data?: { message?: string } }).data?.message === 'string'
      ? (e as { data: { message: string } }).data.message
      : 'Could not start';
    startError.value = msg;
  } finally {
    starting.value = false;
  }
}

const startingNextRound = ref(false);

function nextRoundSeed(): string {
  return `${roomId.value}-${Date.now().toString(36)}-${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`;
}

function startNextRound() {
  if (!room.value || match.state?.status !== 'finished' || !isHost.value) return;
  startingNextRound.value = true;
  try {
    const snapshot = toRaw(match.state)!;
    const firstId = firstPlayerIdForNextRound(snapshot);
    match.startNewRound(room.value.players, { seed: nextRoundSeed(), firstPlayerId: firstId });
    network.relaySnapshot(toRaw(match.state) as GameState);
    toast.success('Next round — new deal.');
  } catch {
    toast.error('Could not start the next round.');
  } finally {
    startingNextRound.value = false;
  }
}

async function joinRoom() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
  joinError.value = null;
  joining.value = true;
  try {
    const joined = await $fetch<Room>(`${config.public.apiBase}/rooms/${roomId.value}/join`, {
      method: 'POST',
      body: { token: tokenFromQuery() || undefined, player: identity.asPlayer() },
    });
    room.value = joined;
    if (tokenFromQuery()) {
      sessionStorage.setItem(joinProfileStorageKey(), '1');
      joinProfileReady.value = true;
    }
    stripFromCreateQuery();
    if (joined.status === 'playing') beginMatch(joined);
    else pollTimer = setInterval(refreshRoom, 2000);
  } catch (e: unknown) {
    const msg = typeof e === 'object' && e !== null && 'data' in e && typeof (e as { data?: { message?: string } }).data?.message === 'string'
      ? (e as { data: { message: string } }).data.message
      : 'Could not join room';
    joinError.value = msg;
  } finally {
    joining.value = false;
  }
}

async function submitJoinProfile() {
  joinError.value = null;
  if (!validateJoinName()) return;
  identity.displayName = trimmedJoinName.value;
  identity.persist();
  await joinRoom();
}

onBeforeMount(() => {
  joinProfileReady.value = sessionStorage.getItem(joinProfileStorageKey()) === '1';
});

onMounted(() => {
  identity.restore();
  const token = tokenFromQuery();
  if (token && !joinProfileReady.value && route.query.from !== 'create') {
    joining.value = false;
    return;
  }
  void joinRoom();
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
  network.disconnect();
  if (import.meta.client) document.documentElement.classList.remove('uno-tab-hidden');
});

function applyAndBroadcast(move: Move) {
  const event = match.apply(move);
  if (event) network.relayEvent(event);
}

function play(card: Card) {
  if (!match.state || match.state.status !== 'playing') return;
  const pid = identity.playerId;
  const move = match.legal(pid).find((m) => m.type === 'PLAY_CARD' && m.cardId === card.id);
  if (!move || move.type !== 'PLAY_CARD') return;
  // Wild / Wild Draw 4: pause and let the player choose a color before we broadcast.
  if (card.color === 'wild') {
    pendingWild.value = { move, wildDrawFour: card.type === 'wild4' };
    return;
  }
  applyAndBroadcast(move);
}

function pickColor(color: PlayColor) {
  const pending = pendingWild.value;
  if (!pending) return;
  pendingWild.value = null;
  applyAndBroadcast({ ...pending.move, chosenColor: color });
}

function cancelColorPick() {
  pendingWild.value = null;
}

function drawFromDeck() {
  if (!match.state || match.state.status !== 'playing') return;
  const pid = identity.playerId;
  const move = match.legal(pid).find((m) => m.type === 'DRAW_CARD');
  if (move) applyAndBroadcast(move);
}

function passAfterDraw() {
  if (!match.state || match.state.status !== 'playing') return;
  const pid = identity.playerId;
  const move = match.legal(pid).find((m) => m.type === 'PASS');
  if (move) applyAndBroadcast(move);
}

function callUno() {
  try {
    applyAndBroadcast({ type: 'CALL_UNO', playerId: identity.playerId });
  } catch {
    toast.error('You can’t call UNO right now.');
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] relative overflow-hidden">
    <div class="flex flex-wrap items-start justify-between gap-4 relative z-10">
      <div class="glass px-4 py-2 rounded-xl">
        <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/80">Match Room</p>
        <h1 class="font-mono text-lg font-bold tracking-tight text-white sm:text-xl">{{ roomId }}</h1>
      </div>
    </div>

    <Card
      v-if="showJoinProfileForm"
      class="mx-auto w-full max-w-xl border-border/80 shadow-lg"
    >
      <CardHeader class="space-y-1">
        <p class="text-xs font-semibold uppercase tracking-[0.35em] text-primary">Join this room</p>
        <CardTitle class="text-2xl sm:text-3xl">Who’s playing?</CardTitle>
        <CardDescription class="text-base leading-relaxed">
          Choose how you show up in the lobby before you connect — the host already picked theirs when they created the room.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="space-y-2">
          <Label for="join-display-name">Display name</Label>
          <Input
            id="join-display-name"
            :model-value="identity.displayName"
            autocomplete="nickname"
            maxlength="40"
            placeholder="e.g. TableShark_02"
            class="h-11"
            :aria-invalid="joinNameError ? 'true' : undefined"
            @blur="() => identity.persist()"
            @update:model-value="onJoinDisplayNameInput"
          />
          <p v-if="joinNameError" class="text-sm text-destructive">{{ joinNameError }}</p>
        </div>
        <div class="space-y-3">
          <AvatarEmojiPicker />
          <Badge variant="secondary" class="inline-flex h-9 px-3 py-1 text-sm font-normal text-muted-foreground">
            Saved only in this browser
          </Badge>
        </div>
        <Alert v-if="joinError" variant="destructive">
          <AlertTitle>Could not join</AlertTitle>
          <AlertDescription>{{ joinError }}</AlertDescription>
        </Alert>
      </CardContent>
      <CardFooter class="flex flex-col gap-3 border-t border-border/60 bg-muted/20 pt-6 sm:flex-row sm:justify-end">
        <Button
          type="button"
          class="h-11 min-w-[11rem] font-semibold"
          size="lg"
          :disabled="joining"
          @click="submitJoinProfile"
        >
          <Loader2 v-if="joining" class="size-4 animate-spin" aria-hidden="true" />
          <span v-if="joining">Joining…</span>
          <span v-else>Join room</span>
        </Button>
      </CardFooter>
    </Card>

    <div v-else-if="joining" class="space-y-4 rounded-xl border border-border/80 bg-card/50 p-6 shadow-sm">
      <Skeleton class="h-5 w-40" />
      <Skeleton class="h-4 w-full max-w-md" />
      <Skeleton class="h-4 w-2/3 max-w-sm" />
      <div class="flex items-center gap-2 pt-2 text-sm text-muted-foreground">
        <Loader2 class="size-4 animate-spin shrink-0" aria-hidden="true" />
        <span>Joining room…</span>
      </div>
    </div>

    <Alert v-else-if="joinError" variant="destructive" class="max-w-xl">
      <AlertTitle>Could not enter this room</AlertTitle>
      <AlertDescription>{{ joinError }}</AlertDescription>
      <div class="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" @click="joinRoom">Try again</Button>
        <Button type="button" variant="outline" size="sm" as-child>
          <NuxtLink to="/">Back home</NuxtLink>
        </Button>
      </div>
    </Alert>

    <Card v-else-if="room && room.status === 'lobby' && !match.state" class="mx-auto w-full max-w-2xl border-border/80 shadow-lg">
      <CardHeader>
        <p class="text-xs font-semibold uppercase tracking-[0.35em] text-primary">Lobby</p>
        <CardTitle class="text-2xl sm:text-3xl">Waiting for players</CardTitle>
        <CardDescription class="text-base leading-relaxed">
          Share the invite link so friends can join. The first player is the host and can start once at least two people are in the room.
          On phones or another machine, open the dev server’s
          <Tooltip>
            <TooltipTrigger as-child>
              <button type="button" class="cursor-pointer font-semibold text-foreground underline decoration-dotted underline-offset-4 hover:decoration-solid">
                network URL
              </button>
            </TooltipTrigger>
            <TooltipContent class="max-w-xs text-pretty">
              Use the URL printed in the terminal (LAN / 0.0.0.0), not localhost, unless everyone is on this computer.
            </TooltipContent>
          </Tooltip>
          from your terminal — not
          <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">localhost</code>
          — unless they’re on the same device.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div class="min-w-0 flex-1 space-y-2">
            <Label for="invite-url">Invite link</Label>
            <Input id="invite-url" :model-value="inviteFullUrl" readonly class="h-11 font-mono text-xs sm:text-sm" />
          </div>
          <Button type="button" class="h-11 shrink-0 sm:min-w-[9rem]" :disabled="!inviteToken" @click="copyInviteLink">
            Copy link
          </Button>
        </div>

        <Separator />

        <div>
          <p class="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Players ({{ room.players.length }} / {{ room.rules.maxPlayers }})
          </p>
          <ul class="mt-3 space-y-2">
            <li
              v-for="p in room.players"
              :key="p.id"
              class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/30 px-4 py-3"
            >
              <span class="flex min-w-0 items-center gap-2">
                <span class="text-xl" aria-hidden="true">{{ displayPlayerAvatar(p.avatar) }}</span>
                <span class="truncate font-medium text-foreground">{{ p.username }}</span>
                <Badge v-if="p.id === room.players[0]?.id" variant="secondary" class="shrink-0">Host</Badge>
              </span>
              <Badge :variant="p.connected ? 'default' : 'outline'" class="shrink-0">
                {{ p.connected ? 'Connected' : 'Away' }}
              </Badge>
            </li>
          </ul>
        </div>

        <p v-if="isHost" class="text-sm text-muted-foreground">
          <template v-if="!canStart">Need at least two players before you can start.</template>
          <template v-else>Everyone here? Start when you’re ready.</template>
        </p>
        <p v-else class="text-sm text-muted-foreground">Hang tight — the host will start the match.</p>

        <Alert v-if="startError" variant="destructive">
          <AlertTitle>Start failed</AlertTitle>
          <AlertDescription>{{ startError }}</AlertDescription>
        </Alert>

        <Button
          v-if="isHost"
          type="button"
          class="h-11 min-w-[10rem] font-semibold"
          size="lg"
          :disabled="!canStart || starting"
          :aria-busy="starting"
          @click="startGame"
        >
          <Loader2 v-if="starting" class="size-4 animate-spin" aria-hidden="true" />
          <span v-if="starting">Starting…</span>
          <span v-else>Start game</span>
        </Button>
      </CardContent>
    </Card>

    <template v-else-if="match.state">
      <div class="relative z-10 flex flex-col gap-6">
        <!-- Players Ring -->
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div
            v-for="player in match.state.players"
            :key="player.id"
            class="relative min-w-0"
          >
            <PlayerPanel
              :player="player"
              :active="player.id === match.state.activePlayerId"
              :card-count="match.state.hands[player.id]?.length ?? 0"
            />
          </div>
        </div>

        <!-- Central Table Area -->
        <div class="relative flex flex-col items-center justify-center py-12 sm:py-20">
          <!-- Direction Indicator -->
          <div 
            class="absolute inset-0 flex items-center justify-center pointer-events-none"
            :class="turnDirAnimClass"
          >
            <div class="size-[14rem] sm:size-[18rem] lg:size-[22rem] rounded-full border-[10px] border-dashed border-white/5 opacity-20" />
          </div>

          <div class="flex flex-wrap items-center justify-center gap-12 sm:gap-24 relative z-10">
            <!-- Draw Pile -->
            <button 
              type="button"
              class="group relative flex flex-col items-center gap-3 transition-all duration-300 cursor-pointer hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:active:scale-100"
              :disabled="!isMyTurn || match.state.status !== 'playing'"
              @click="drawFromDeck"
            >
              <div 
                class="relative uno-decorative-anim"
                :class="[
                  isMyTurn ? 'animate-[uno-blink_2s_infinite]' : '',
                  mustDrawNoPlayable ? 'animate-[uno-flicker_0.5s_ease-in-out_infinite] shadow-[0_0_28px_-4px_var(--primary)]' : ''
                ]"
              >
                <!-- Stacked card effect -->
                <div class="absolute -inset-1 rounded-[1.1rem] bg-black/20 translate-y-2 translate-x-1" />
                <div class="absolute -inset-1 rounded-[1.1rem] bg-black/20 translate-y-1 translate-x-0.5" />
                <div 
                  class="uno-card uno-card--wild flex items-center justify-center border-white/40 bg-slate-900 shadow-2xl transition-all"
                  :class="isMyTurn ? 'scale-105 border-primary ring-2 ring-primary/35 shadow-[0_0_40px_-6px_var(--primary)]' : ''"
                >
                  <span 
                    class="flex h-full w-full items-center justify-center font-black select-none transition-all duration-300 leading-none"
                    :class="[
                      pendingStackDraw > 0
                        ? 'text-red-500 scale-110 text-5xl'
                        : (isMyTurn ? 'text-primary/40 text-4xl italic tracking-tighter' : 'text-white/20 text-4xl italic tracking-tighter'),
                    ]"
                  >
                    {{ pendingStackDraw > 0 ? `+${pendingStackDraw}` : 'UNO' }}
                  </span>
                </div>
              </div>
              <div 
                class="glass px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white shadow-lg transition-all duration-300"
                :class="isMyTurn ? 'bg-primary text-primary-foreground border-primary scale-110 shadow-[0_0_20px_var(--primary)]' : ''"
              >
                Deck ({{ deckCount }})
              </div>
            </button>

            <!-- Discard Pile -->
            <div class="flex flex-col items-center gap-3">
              <div class="relative">
                <div class="absolute -inset-4 rounded-full bg-white/5 blur-md" />
                <UnoCardFace v-if="topDiscard" :card="topDiscard" class="relative z-10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]" />
                <div v-else class="uno-card border-dashed border-white/10 bg-white/5" />
              </div>
              <div 
                class="glass px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-white shadow-lg flex items-center gap-2"
                :style="activeColorStyle"
              >
                <span class="size-2 rounded-full bg-white uno-decorative-anim animate-pulse" />
                {{ match.state.currentColor || 'No Color' }}
              </div>
            </div>
          </div>
        </div>

        <!-- Hand Area -->
        <div class="mt-auto relative">
          <Alert v-if="!match.state.players.some((p) => p.id === identity.playerId)" variant="destructive" class="mb-4">
            <AlertTitle>Wrong seat</AlertTitle>
            <AlertDescription>
              Your player id is not in this match. Re-open the invite link.
            </AlertDescription>
          </Alert>
          
          <div class="relative glass rounded-[2rem] p-4 sm:p-6 shadow-2xl border-white/10">
            <HandRail :viewer-id="identity.playerId" :cards="match.state.hands[identity.playerId] ?? []" :state="match.state" @play="play" />
            
            <div class="absolute bottom-6 left-6 z-20 flex flex-wrap items-end gap-3">
              <Button
                v-if="mustDrawNoPlayable || drawnPlayableOffer"
                type="button"
                variant="secondary"
                size="lg"
                class="glass border-white/20 hover:bg-white/20"
                @click="drawnPlayableOffer ? passAfterDraw() : drawFromDeck()"
              >
                {{ drawnPlayableOffer ? 'Pass Turn' : 'Draw Card' }}
              </Button>
              
              <UnoButton 
                v-if="canPressUno"
                :enabled="true"
                urgent
                @uno="callUno"
              />
            </div>
          </div>
        </div>
      </div>
    </template>

    <Dialog v-model:open="gameOverDialogOpen">
      <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-lg" aria-describedby="game-over-desc">
        <DialogHeader>
          <p class="text-xs font-semibold uppercase tracking-[0.35em] text-primary">Game over</p>
          <DialogTitle class="flex flex-wrap items-center gap-2 text-2xl">
            <PartyPopper class="size-7 shrink-0 text-primary" aria-hidden="true" />
            <span v-if="winnerPlayer">
              <span class="text-2xl" aria-hidden="true">{{ displayPlayerAvatar(winnerPlayer.avatar) }}</span>
              {{ winnerPlayer.username }} wins!
            </span>
            <span v-else>We have a winner</span>
          </DialogTitle>
          <DialogDescription id="game-over-desc" class="text-base">
            <template v-if="winnerPlayer && winnerPlayer.id === identity.playerId">You emptied your hand first — nice game.</template>
            <template v-else-if="winnerPlayer">{{ winnerPlayer.username }} played their last card. Everyone sees the same result here.</template>
            <template v-else>The match ended with a winner.</template>
          </DialogDescription>
          <p v-if="nextRoundOpener" class="text-sm text-muted-foreground">
            Next deal opens with
            <span class="font-medium text-foreground">{{ nextRoundOpener.username }}</span>
            (next in turn order after the winner).
          </p>
          <p v-if="!isHost" class="text-sm text-muted-foreground">Only the host can deal the next round.</p>
        </DialogHeader>

        <div v-if="gameOverStandings.length" class="space-y-2">
          <p class="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Hand points (classic UNO scoring, lowest first)
          </p>
          <ol class="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-border/80 bg-muted/25 p-3">
            <li
              v-for="row in gameOverStandings"
              :key="row.player.id"
              class="flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm"
              :class="match.state?.winnerId === row.player.id ? 'bg-primary/12 ring-1 ring-primary/25' : ''"
            >
              <span class="flex min-w-0 flex-1 items-center gap-2">
                <span class="w-6 shrink-0 tabular-nums text-muted-foreground">{{ row.rank }}</span>
                <span class="text-lg leading-none" aria-hidden="true">{{ displayPlayerAvatar(row.player.avatar) }}</span>
                <span class="min-w-0 truncate font-medium text-foreground">{{ row.player.username }}</span>
                <Badge v-if="match.state?.winnerId === row.player.id" variant="secondary" class="shrink-0">Winner</Badge>
              </span>
              <span class="shrink-0 tabular-nums text-muted-foreground">{{ row.handPoints }} pts</span>
            </li>
          </ol>
        </div>

        <DialogFooter class="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            v-if="isHost"
            type="button"
            class="w-full sm:w-auto"
            :disabled="startingNextRound"
            @click="startNextRound"
          >
            <Loader2 v-if="startingNextRound" class="size-4 animate-spin" aria-hidden="true" />
            <span v-if="startingNextRound">Dealing…</span>
            <span v-else>Play next round</span>
          </Button>
          <Button type="button" variant="secondary" class="w-full sm:w-auto" @click="gameOverDialogOpen = false">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Teleport to="body">
      <!-- Confetti’s own root uses z-index 1200; pointer-events don’t inherit, so particles would
           still eat clicks on the game-over dialog unless every descendant opts out too. -->
      <div
        class="pointer-events-none fixed inset-0 z-[200] overflow-visible [&_*]:pointer-events-none"
        aria-hidden="true"
      >
        <ConfettiExplosion
          v-if="showVictoryConfetti && confettiParticleCount > 0"
          class="absolute left-1/2 top-[min(22vh,200px)] -translate-x-1/2"
          :particle-count="confettiParticleCount"
          :force="confettiForce"
          :stage-width="confettiStageWidth"
          :stage-height="confettiStageHeight"
          :duration="2600"
          :colors="confettiPalette"
        />
      </div>
    </Teleport>

    <Dialog v-model:open="wildDialogOpen">
      <DialogContent class="sm:max-w-md" aria-describedby="wild-color-help">
        <DialogHeader>
          <p class="text-xs font-semibold uppercase tracking-[0.35em] text-primary">
            {{ pendingWild?.wildDrawFour ? 'Wild draw four' : 'Wild card' }}
          </p>
          <DialogTitle class="text-xl">{{ wildDialogTitle }}</DialogTitle>
          <DialogDescription id="wild-color-help">
            {{ wildDialogDescription }}
          </DialogDescription>
        </DialogHeader>
        <div class="grid grid-cols-2 gap-2 sm:gap-3">
          <Button
            v-for="c in colorPalette"
            :key="c.id"
            type="button"
            variant="outline"
            class="h-auto justify-start gap-3 border-2 py-4 text-left font-semibold text-white shadow-md transition hover:scale-[1.02]"
            :style="{ background: c.swatch, borderColor: 'rgb(255 255 255 / 0.35)' }"
            @click="pickColor(c.id)"
          >
            <span class="inline-block size-6 shrink-0 rounded-full border-2 border-white/70" aria-hidden="true" />
            <span>{{ c.label }}</span>
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" class="w-full sm:w-auto" @click="cancelColorPick">Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
