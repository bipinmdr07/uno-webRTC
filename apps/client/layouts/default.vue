<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next';

const route = useRoute();
const showHome = computed(() => route.path !== '/');
/** Puts `dark` on `<html>` so Tailwind’s `dark:` variant and `.dark { … }` tokens both apply. */
const isDark = useDark({ initialValue: 'dark', storageKey: 'vueuse-color-scheme' });
</script>

<template>
  <TooltipProvider>
    <div class="relative flex min-h-dvh flex-col">
      <div
        class="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,oklch(0.85_0.18_92/0.15),transparent_55%),radial-gradient(ellipse_80%_50%_at_100%_50%,oklch(0.7_0.15_25/0.1),transparent),radial-gradient(ellipse_60%_40%_at_0%_80%,oklch(0.8_0.16_95/0.2),transparent)] dark:bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,oklch(0.35_0.15_270/0.4),transparent_55%),radial-gradient(ellipse_80%_50%_at_100%_50%,oklch(0.45_0.1_300/0.15),transparent),radial-gradient(ellipse_60%_40%_at_0%_80%,oklch(0.55_0.12_92/0.1),transparent)]"
        aria-hidden="true"
      />
      <div class="uno-table-surface" aria-hidden="true" />
      <header
        class="sticky top-0 z-50 border-b border-white/10 bg-black/25 backdrop-blur-sm supports-[backdrop-filter]:bg-black/20"
      >
        <div class="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <NuxtLink to="/" class="group flex items-center gap-3 font-bold tracking-tighter text-white">
            <span
              class="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-xl text-primary-foreground shadow-lg transition group-hover:scale-110 group-hover:rotate-6"
              aria-hidden="true"
            >🃏</span>
            <span class="text-lg sm:text-xl uppercase">UNO <span class="text-primary opacity-80">WebRTC</span></span>
          </NuxtLink>
          <div class="flex items-center gap-1 sm:gap-2">
            <Button v-if="showHome" variant="ghost" size="sm" as-child>
              <NuxtLink to="/">Home</NuxtLink>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              :aria-label="isDark ? 'Use light theme' : 'Use dark theme'"
              @click="isDark = !isDark"
            >
              <Sun v-if="isDark" class="size-4" aria-hidden="true" />
              <Moon v-else class="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </header>
      <main class="relative mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10">
        <slot />
      </main>
      <Toaster rich-colors position="top-center" :theme="isDark ? 'dark' : 'light'" />
    </div>
  </TooltipProvider>
</template>
