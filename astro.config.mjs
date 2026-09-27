import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://380tonight.com',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  // listen on the local network too, so a phone on the same Wi-Fi can open the dev site
  // also let a Cloudflare quick tunnel (npx cloudflared ...) through, for testing on a phone
  server: { host: true, allowedHosts: ['.trycloudflare.com'] }
});
