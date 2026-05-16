/** Runs before the app mounts — keep this in sync with the inline script and `storageKey` on `useDark` in the default layout. */
export default defineNuxtPlugin({
  name: 'theme-init',
  enforce: 'pre',
  setup() {
    const stored = localStorage.getItem('vueuse-color-scheme');
    if (stored === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  },
});
