import { defineStore } from 'pinia';
import type { Player } from '@uno/shared-types';
import { AVATAR_EMOJIS, isAllowedAvatar, normalizeStoredAvatar } from '@uno/shared-types';

type IdentityState = {
  playerId: string;
  displayName: string;
  avatar: string;
};

export const useIdentityStore = defineStore('identity', {
  state: (): IdentityState => ({
    playerId: '',
    displayName: 'Guest',
    avatar: AVATAR_EMOJIS[0],
  }),
  actions: {
    restore() {
      if (import.meta.server) return;
      const saved = localStorage.getItem('uno.identity');
      if (saved) Object.assign(this, JSON.parse(saved));
      if (!this.playerId) this.playerId = crypto.randomUUID();
      this.avatar = normalizeStoredAvatar(this.avatar);
      this.persist();
    },
    setAvatar(emoji: string) {
      if (!isAllowedAvatar(emoji)) return;
      this.avatar = emoji;
      this.persist();
    },
    randomizeAvatar() {
      const i = Math.floor(Math.random() * AVATAR_EMOJIS.length);
      this.avatar = AVATAR_EMOJIS[i];
      this.persist();
    },
    persist() { if (!import.meta.server) localStorage.setItem('uno.identity', JSON.stringify(this.$state)); },
    asPlayer(): Player { return { id: this.playerId, username: this.displayName, avatar: this.avatar, connected: true, score: 0 }; },
  },
});
