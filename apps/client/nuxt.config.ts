import tailwindcss from '@tailwindcss/vite';

const publicApiBase = process.env.NUXT_PUBLIC_API_BASE ?? (process.env.NODE_ENV === 'production' ? 'http://localhost:4100' : '/api');

/** Public deploy (e.g. Cloudflare in front of a tunnel): turn off Rocket Loader and Web Analytics on the zone if module scripts or Third-party beacons break the app; ship a production build, not `nuxt dev`, through the tunnel. */
export default defineNuxtConfig({
  app: {
    head: {
      // Default dark so SSR matches `.dark` CSS variables; narrow inline script aligns with `plugins/theme.client.ts` and `useDark` storageKey `vueuse-color-scheme`.
      htmlAttrs: {
        class: 'dark',
      },
      script: [
        {
          key: 'uno-vueuse-theme-sync',
          innerHTML: `(function(){try{var k='vueuse-color-scheme';if(localStorage.getItem(k)==='light')document.documentElement.classList.remove('dark');else document.documentElement.classList.add('dark')}catch(_){document.documentElement.classList.add('dark')}})()`,
        },
      ],
      // Load fonts here instead of @import in tailwind.css — Vite can treat external CSS
      // @imports as JS module deps on client navigations, which breaks hydration (MIME text/css).
      link: [
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap',
        },
      ],
    },
  },
  // Turn off Nuxt telemetry so we don't get the Yes/No prompt in dev — under turbo it
  // often can't read arrow keys and feels like the app never finished starting.
  telemetry: false,
  devtools: { enabled: true },
  modules: ['@pinia/nuxt', '@vueuse/nuxt', 'shadcn-nuxt'],
  shadcn: {
    prefix: '',
    componentDir: '@/components/ui',
  },
  css: ['~/assets/css/tailwind.css'],
  // REST proxying for `/api` is fine through Vite, but socket.io's WebSocket upgrade
  // does NOT survive the Nuxt dev pipeline — Nitro's SSR catches `/socket.io/` first and
  // every failed upgrade was crashing the dev server with EPIPE/ECONNRESET. So we leave
  // signaling out of the proxy entirely; the client connects to Fastify directly on its
  // own port (see `resolveSignalingUrl` in the room page for the LAN-friendly default).
  build: {
    transpile: ['@uno/ui', '@uno/game-engine', '@uno/network'],
  },
  vite: {
    plugins: [tailwindcss()],
    server: {
      // Vite 6 defaults to a strict Host allowlist; tunnels and arbitrary dev hostnames need this off.
      allowedHosts: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:4100',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '') || '/',
        },
      },
    },
  },
  // `signalingUrl` is left blank by default — the room page picks up the page's hostname
  // and the well-known Fastify port (4100) so phones on the LAN automatically hit the
  // dev machine's IP. Override with NUXT_PUBLIC_SIGNALING_URL for non-default setups.
  runtimeConfig: {
    public: {
      apiBase: publicApiBase,
      signalingUrl: process.env.NUXT_PUBLIC_SIGNALING_URL ?? '',
      // Comma-separated: `polling`, `websocket`, or both (default). Use `polling` alone if your
      // CDN/tunnel misbehaves on the WebSocket upgrade (some setups surface that as Cloudflare 1016).
      signalingTransports: process.env.NUXT_PUBLIC_SIGNALING_TRANSPORTS ?? '',
    },
  },
  typescript: { strict: true },
});
