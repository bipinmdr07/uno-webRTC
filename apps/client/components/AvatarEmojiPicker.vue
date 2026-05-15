<script setup lang="ts">
import { AVATAR_EMOJIS } from '@uno/shared-types';

const identity = useIdentityStore();

function pick(emoji: string) {
  identity.setAvatar(emoji);
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <Label class="text-foreground">Avatar</Label>
      <Button type="button" variant="ghost" size="sm" class="h-8 shrink-0 text-xs" @click="identity.randomizeAvatar">
        Shuffle
      </Button>
    </div>
    <div
      role="group"
      aria-label="Avatar emoji"
      class="grid max-w-md grid-cols-5 gap-2 sm:grid-cols-7"
    >
      <button
        v-for="(emoji, i) in AVATAR_EMOJIS"
        :key="i"
        type="button"
        class="flex size-11 cursor-pointer items-center justify-center rounded-xl border text-2xl leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:size-12 sm:text-[1.65rem]"
        :class="
          identity.avatar === emoji
            ? 'border-primary bg-primary/15 ring-2 ring-primary/50'
            : 'border-border/80 bg-card/80 hover:bg-muted/60'
        "
        :aria-pressed="identity.avatar === emoji"
        :aria-label="`Avatar ${emoji}`"
        @click="pick(emoji)"
      >
        {{ emoji }}
      </button>
    </div>
  </div>
</template>
