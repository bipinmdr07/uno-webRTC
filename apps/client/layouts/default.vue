<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next';

const route = useRoute();
const showHome = computed(() => route.path !== '/');
/** Puts `dark` on `<html>` so Tailwind’s `dark:` variant and `.dark { … }` tokens both apply. */
const isDark = useDark({ initialValue: 'dark' });
</script>

<template>
  <TooltipProvider>
    <div class="relative flex min-h-dvh flex-col">
      <div
        class="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,oklch(0.88_0.1_92/0.45),transparent_55%),radial-gradient(ellipse_80%_50%_at_100%_50%,oklch(0.72_0.14_25/0.14),transparent),radial-gradient(ellipse_60%_40%_at_0%_80%,oklch(0.92_0.06_95/0.35),transparent)] dark:bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,oklch(0.45_0.18_270/0.35),transparent_55%),radial-gradient(ellipse_80%_50%_at_100%_50%,oklch(0.55_0.12_300/0.12),transparent),radial-gradient(ellipse_60%_40%_at_0%_80%,oklch(0.75_0.14_92/0.08),transparent)]"
        aria-hidden="true"
      />
      <header
        class="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60"
      >
        <div class="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <NuxtLink to="/" class="group flex items-center gap-2 font-semibold tracking-tight text-foreground">
            <span
              class="flex size-8 items-center justify-center rounded-lg bg-primary text-lg text-primary-foreground shadow-sm transition group-hover:brightness-110"
              aria-hidden="true"
            >🃏</span>
            <span class="text-sm sm:text-base">UNO <span class="text-muted-foreground">WebRTC</span></span>
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
