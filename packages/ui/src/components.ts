import { computed, defineComponent, h, type PropType, type VNode } from 'vue';
import { mayPlayCard, sortHand } from '@uno/game-engine';
import { displayPlayerAvatar, type Card, type GameState, type Player } from '@uno/shared-types';

/** Short label for logs, tests, and `aria-label` fallbacks. */
export function unoCardFaceLabel(card: Card): string | number {
  if (card.type === 'number') return card.value ?? '';
  if (card.type === 'wild4') return 'Wild +4';
  if (card.type === 'wild') return 'Wild';
  if (card.type === 'draw2') return '+2';
  if (card.type === 'skip') return 'Skip';
  if (card.type === 'reverse') return 'Reverse';
  return card.type;
}

function cardModifierClass(card: Card): string {
  if (card.color === 'wild' && card.type === 'wild4') return 'uno-card--wild4';
  return `uno-card--${card.color}`;
}

/** Gentle arc: outer cards lean away from center so the strip feels gripped along the bottom. */
function handFanTiltDeg(index: number, count: number): number {
  if (count <= 1) return 0;
  const center = (count - 1) / 2;
  const maxTilt = 6.5;
  return ((index - center) / center) * maxTilt;
}

function hSkipGlyph(cls: string): VNode {
  return h('svg', { class: cls, viewBox: '0 0 100 100', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' }, [
    h('circle', { cx: '50', cy: '50', r: '36', stroke: 'currentColor', 'stroke-width': '9' }),
    h('path', {
      d: 'M28 72 L72 28',
      stroke: 'currentColor',
      'stroke-width': '9',
      'stroke-linecap': 'round',
    }),
  ]);
}

function hReverseGlyph(cls: string): VNode {
  return h('svg', { class: cls, viewBox: '0 0 100 100', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' }, [
    h('path', {
      d: 'M72 34c-4-20-22-32-40-26-16 4-28 18-28 36',
      stroke: 'currentColor',
      'stroke-width': '9',
      'stroke-linecap': 'round',
      fill: 'none',
    }),
    h('path', { d: 'M64 20 L78 30 72 44', fill: 'currentColor' }),
    h('path', {
      d: 'M28 66c4 20 22 32 40 26 16-4 28-18 28-36',
      stroke: 'currentColor',
      'stroke-width': '9',
      'stroke-linecap': 'round',
      fill: 'none',
    }),
    h('path', { d: 'M36 80 L22 70 28 56', fill: 'currentColor' }),
  ]);
}

/** Renders the classic UNO face: corner pips + tilted white oval (or wild layouts). No bitmap assets. */
function unoCardFaceChildren(card: Card): VNode[] {
  if (card.color === 'wild' && card.type === 'wild4') {
    return [
      h('span', { class: 'uno-card__pip uno-card__pip--tl' }, '+4'),
      h('span', { class: 'uno-card__pip uno-card__pip--br' }, '+4'),
      h('div', { class: 'uno-card__wild4-bars', 'aria-hidden': 'true' }, [
        h('span', { class: 'uno-card__wild4-bar uno-card__wild4-bar--r' }),
        h('span', { class: 'uno-card__wild4-bar uno-card__wild4-bar--y' }),
        h('span', { class: 'uno-card__wild4-bar uno-card__wild4-bar--g' }),
        h('span', { class: 'uno-card__wild4-bar uno-card__wild4-bar--b' }),
      ]),
    ];
  }

  if (card.color === 'wild') {
    return [
      h('div', { class: 'uno-card__wild-oval', 'aria-hidden': 'true' }, [
        h('span', { class: 'uno-card__wild-cell uno-card__wild-cell--r' }),
        h('span', { class: 'uno-card__wild-cell uno-card__wild-cell--y' }),
        h('span', { class: 'uno-card__wild-cell uno-card__wild-cell--g' }),
        h('span', { class: 'uno-card__wild-cell uno-card__wild-cell--b' }),
      ]),
    ];
  }

  const pipClass = (base: string) => {
    if (card.type === 'number' && (card.value === 6 || card.value === 9)) return `${base} uno-card__pip--orient`;
    return base;
  };

  const corner = (): VNode | string => {
    if (card.type === 'number') return h('span', { class: pipClass('uno-card__pip-inner') }, String(card.value));
    if (card.type === 'draw2') return h('span', { class: 'uno-card__pip-inner' }, '+2');
    if (card.type === 'skip') return hSkipGlyph('uno-card__pip-icon');
    return hReverseGlyph('uno-card__pip-icon');
  };

  const center = (): VNode | string => {
    if (card.type === 'number') {
      return h('span', { class: ['uno-card__center-glyph', pipClass('uno-card__center-inner')] }, String(card.value));
    }
    if (card.type === 'draw2') return h('span', { class: 'uno-card__center-glyph uno-card__draw2' }, '+2');
    if (card.type === 'skip') return hSkipGlyph('uno-card__center-icon');
    return hReverseGlyph('uno-card__center-icon');
  };

  return [
    h('span', { class: 'uno-card__pip uno-card__pip--tl' }, [corner()]),
    h('span', { class: 'uno-card__pip uno-card__pip--br' }, [corner()]),
    h('div', { class: 'uno-card__oval', 'aria-hidden': 'true' }, [center()]),
  ];
}

/** Read-only face — same chrome as `UnoCard` so the discard pile matches the hand. */
export const UnoCardFace = defineComponent({
  name: 'UnoCardFace',
  props: { card: { type: Object as PropType<Card>, required: true } },
  setup(props) {
    return () => h('div', {
      class: ['uno-card', cardModifierClass(props.card), 'uno-card--face'],
      role: 'img',
      'aria-label': `${props.card.color} ${unoCardFaceLabel(props.card)}`,
    }, unoCardFaceChildren(props.card));
  },
});

export const UnoCard = defineComponent({
  name: 'UnoCard',
  props: {
    card: { type: Object as PropType<Card>, required: true },
    eligible: { type: Boolean, default: false },
    /**
     * Same idea as the React reference CardFace `onClick` prop — a plain callback so parent `h()`
     * does not depend on Vue forwarding `onPlay` onto nested component emits (that path can drop
     * events in some setups).
     */
    handlePlay: { type: Function as PropType<(card: Card) => void>, required: true },
  },
  setup(props) {
    return () => h('button', {
      type: 'button',
      class: ['uno-card shrink-0', cardModifierClass(props.card), props.eligible && 'uno-card--eligible'],
      disabled: !props.eligible,
      'aria-label': `Play ${props.card.color} ${unoCardFaceLabel(props.card)}`,
      onClick: (e: Event) => {
        e.preventDefault();
        if (props.eligible) props.handlePlay(props.card);
      },
    }, unoCardFaceChildren(props.card));
  },
});

export const HandRail = defineComponent({
  name: 'HandRail',
  props: {
    cards: { type: Array as PropType<Card[]>, required: true },
    state: { type: Object as PropType<GameState>, required: true },
    /** Who is looking at this rail — only they can click plays, and only on their turn. */
    viewerId: { type: String, required: true },
  },
  emits: ['play'],
  setup(props, { emit }) {
    const sorted = computed(() => sortHand(props.cards));
    // Overlapped strip like the mobile UNO hand: each card shifts right by a small “peek” so you
    // mostly see color + the top-left index; the rightmost card reads as fully on top.
    return () => h('div', { class: 'uno-hand-rail' }, sorted.value.map((card, i) => {
      const eligible = props.viewerId === props.state.activePlayerId
        && mayPlayCard(props.state, props.viewerId, card);
      const tilt = handFanTiltDeg(i, sorted.value.length);
      return h('div', {
        class: 'uno-hand-rail__slot',
        style: {
          zIndex: i + 1,
          transform: `rotate(${tilt}deg)`,
        },
      }, [
        h(UnoCard, {
          card,
          eligible,
          handlePlay: (c: Card) => emit('play', c),
        }),
      ]);
    }));
  },
});

export const PlayerPanel = defineComponent({
  name: 'PlayerPanel',
  props: {
    player: { type: Object as PropType<Player>, required: true },
    active: { type: Boolean, default: false },
    cardCount: { type: Number, required: true },
  },
  setup(props) {
    return () => h('aside', {
      class: [
        'relative flex min-w-0 flex-wrap items-center gap-2 rounded-full border border-border/80 bg-card/60 px-3 py-2 text-sm text-card-foreground shadow-sm backdrop-blur-md transition-[box-shadow,ring] sm:gap-2.5 sm:px-4',
        props.active && 'z-[1] ring-2 ring-primary/70 ring-offset-2 ring-offset-background animate-[uno-pulse_0.65s_ease-in-out_infinite_alternate]',
      ],
    }, [
      h('span', { class: 'text-lg leading-none', 'aria-hidden': 'true' }, displayPlayerAvatar(props.player.avatar)),
      h('strong', { class: 'min-w-0 flex-1 truncate font-semibold' }, props.player.username),
      h('small', { class: 'shrink-0 tabular-nums text-muted-foreground' }, `${props.cardCount} cards`),
    ]);
  },
});

export const UnoButton = defineComponent({
  name: 'UnoButton',
  props: { enabled: { type: Boolean, default: false }, urgent: { type: Boolean, default: false } },
  emits: ['uno'],
  setup(props, { emit }) {
    return () => h('button', {
      type: 'button',
      class: [
        // Big red dome: inset highlight plus a thick base shadow so it reads like a physical button on the table.
        'relative flex h-[4.75rem] w-[4.75rem] shrink-0 items-center justify-center rounded-full border-2 border-red-950/45 bg-gradient-to-b from-red-500 via-red-600 to-red-900 text-center text-[0.95rem] font-black leading-none tracking-[0.14em] text-white',
        '[text-shadow:0_1px_0_rgb(0_0_0_/_45%)] shadow-[inset_0_3px_10px_rgb(255_255_255_/_38%),inset_0_-7px_14px_rgb(0_0_0_/_28%),0_6px_0_#7f1d1d,0_10px_22px_rgb(0_0_0_/_35%)]',
        'transition-[transform,box-shadow,filter] duration-150 ease-out',
        'enabled:cursor-pointer enabled:hover:brightness-110 enabled:hover:-translate-y-0.5 enabled:hover:shadow-[inset_0_3px_10px_rgb(255_255_255_/_38%),inset_0_-7px_14px_rgb(0_0_0_/_28%),0_8px_0_#7f1d1d,0_14px_26px_rgb(0_0_0_/_38%)]',
        'enabled:active:translate-y-1 enabled:active:brightness-105 enabled:active:shadow-[inset_0_8px_14px_rgb(0_0_0_/_35%),0_3px_0_#7f1d1d,0_6px_14px_rgb(0_0_0_/_28%)]',
        'disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-[inset_0_5px_12px_rgb(0_0_0_/_25%)] disabled:brightness-95',
        props.urgent && 'z-10 animate-[uno-pulse_0.65s_ease-in-out_infinite_alternate]',
      ],
      disabled: !props.enabled,
      onClick: () => emit('uno'),
    }, 'UNO!');
  },
});

export const DirectionArrow = defineComponent({
  name: 'DirectionArrow',
  props: { direction: { type: Number as PropType<1 | -1>, required: true } },
  setup(props) {
    const cw = props.direction === 1;
    return () => h('div', {
      class: 'inline-flex items-center gap-2 rounded-full border border-border bg-muted/80 px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm',
      title: cw ? 'Play order is clockwise' : 'Play order is counter-clockwise',
    }, [
      h('span', { class: 'text-base tabular-nums leading-none text-foreground', 'aria-hidden': 'true' }, cw ? '↻' : '↺'),
      h('span', cw ? 'Clockwise' : 'Counter-clockwise'),
    ]);
  },
});
