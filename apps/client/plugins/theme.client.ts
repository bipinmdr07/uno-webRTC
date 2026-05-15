/** Runs before the app mounts so dark default matches useDark({ initialValue: 'dark' }). */
export default defineNuxtPlugin({
  name: 'theme-init',
  enforce: 'pre',
  setup() {
    const stored = localStorage.getItem('vueuse-color-scheme');
    if (stored !== 'light') {
      document.documentElement.classList.add('dark');
    }
  },
});
