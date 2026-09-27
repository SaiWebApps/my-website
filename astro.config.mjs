import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://sairambkrishnan.com',
  output: 'static',
  trailingSlash: 'never',
  devToolbar: { enabled: false },
  integrations: [sitemap({
    customPages: ['https://sairambkrishnan.com/talks/knowledge-graphs'],
    filter: (page) => {
      const path = new URL(page).pathname.replace(/\/$/, '') || '/';
      return ['/', '/career', '/projects', '/research', '/speaking', '/contact', '/talks/knowledge-graphs'].includes(path);
    },
    serialize: (item) => ({ ...item, url: item.url.replace(/(?<=\.com\/.+)\/$/, '') }),
  })],
});
