<script lang="ts" setup>
import type { ToasterProps } from 'vue-sonner';
import { computed } from 'vue';
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-vue-next';
import { Toaster as Sonner } from 'vue-sonner';
import { cn } from '@/lib/utils';

const props = defineProps<ToasterProps>();

const toastOptions = computed(() => ({
  ...props.toastOptions,
  classes: {
    toast: 'rounded-2xl',
    ...props.toastOptions?.classes,
  },
}));
</script>

<template>
  <!-- vue-sonner touches the DOM and Vue render context in ways that break SSR / first paint with long invite URLs; Nuxt’s own module registers Toaster as client-only for the same reason. -->
  <ClientOnly>
    <Sonner
      v-bind="props"
      :class="cn('toaster group', props.class)"
      :style="{
        '--normal-bg': 'var(--popover)',
        '--normal-text': 'var(--popover-foreground)',
        '--normal-border': 'var(--border)',
        '--border-radius': 'var(--radius)',
      }"
      :toast-options="toastOptions"
    >
    <template #success-icon>
      <CircleCheckIcon class="size-4" />
    </template>
    <template #info-icon>
      <InfoIcon class="size-4" />
    </template>
    <template #warning-icon>
      <TriangleAlertIcon class="size-4" />
    </template>
    <template #error-icon>
      <OctagonXIcon class="size-4" />
    </template>
    <template #loading-icon>
      <div>
        <Loader2Icon class="size-4 animate-spin" />
      </div>
    </template>
    <template #close-icon>
      <XIcon class="size-4" />
    </template>
    </Sonner>
  </ClientOnly>
</template>
