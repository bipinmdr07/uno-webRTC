import { provideSSRWidth } from '@vueuse/core';

/** Gives overlays a stable width guess on SSR so reka-ui dialogs don’t hydration-mismatch on phones. */
export default defineNuxtPlugin((nuxtApp) => {
  provideSSRWidth(1024, nuxtApp.vueApp);
});
