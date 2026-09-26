import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://sairambkrishnan.com',
  output: 'static',
  devToolbar: { enabled: false },
  integrations: [sitemap({ filter: (page) => {
    const path = new URL(page).pathname.replace(/\/$/, '') || '/';
    return ['/', '/career', '/projects', '/research', '/contact'].includes(path);
  } })],
});
