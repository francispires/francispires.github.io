import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';

function remarkMermaid() {
  return (tree) => {
    function walk(node) {
      if (node.type === 'code' && node.lang === 'mermaid') {
        node.type = 'html';
        node.value = `<div class="mermaid">\n${node.value}\n</div>`;
        delete node.lang;
        delete node.meta;
      }
      if (node.children) node.children.forEach(walk);
    }
    walk(tree);
  };
}

export default defineConfig({
  site: 'https://www.francispires.com.br',
  integrations: [
    tailwind({ applyBaseStyles: false }),
    mdx(),
  ],
  markdown: {
    shikiConfig: {
      theme: 'tokyo-night',
      wrap: true,
    },
    remarkPlugins: [remarkMermaid],
  },
});
