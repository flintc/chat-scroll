import { defineConfig } from 'vitepress'

// `BASE` lets us deploy under a sub-path like `/chat-scroll/` for
// GitHub Pages — the GitHub Action passes it via env.
const BASE = process.env.DOCS_BASE ?? '/'

export default defineConfig({
  base: BASE,
  title: 'chat-scroll',
  description:
    'Headless scroll management for chat UIs — framework-agnostic core with thin adapters for React, Vue, and Solid.',
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${BASE}logo.svg` }],
    ['meta', { name: 'theme-color', content: '#3b82f6' }],
    [
      'meta',
      {
        property: 'og:title',
        content: 'chat-scroll — Headless scroll for chat UIs',
      },
    ],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'Pin-to-top, stick-to-bottom, gutter management. Built like @tanstack/virtual: tiny core, thin framework adapters.',
      },
    ],
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'API', link: '/reference/core' },
      { text: 'Recipes', link: '/recipes/' },
      {
        text: 'v0.1.0',
        items: [
          { text: 'Changelog', link: '/changelog' },
          { text: 'GitHub', link: 'https://github.com/flintc/chat-scroll' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting started',
          items: [
            { text: 'Introduction', link: '/guide/introduction' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Concepts', link: '/guide/concepts' },
          ],
        },
        {
          text: 'Strategies',
          items: [
            { text: 'Pin-to-top (AI chat)', link: '/guide/pin-to-top' },
            {
              text: 'Stick-to-bottom (traditional)',
              link: '/guide/stick-to-bottom',
            },
          ],
        },
        {
          text: 'Framework adapters',
          items: [
            { text: 'React', link: '/guide/react' },
            { text: 'Vue', link: '/guide/vue' },
            { text: 'Solid', link: '/guide/solid' },
            { text: 'Vanilla JS', link: '/guide/vanilla' },
          ],
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Streaming mode', link: '/guide/streaming' },
            {
              text: 'Scroll restoration',
              link: '/guide/scroll-restoration',
            },
            {
              text: 'Lower-level utilities',
              link: '/guide/lower-level-utilities',
            },
            { text: 'SSR', link: '/guide/ssr' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Core',
          items: [
            { text: '@chat-scroll/core', link: '/reference/core' },
            { text: 'Options', link: '/reference/options' },
            { text: 'State', link: '/reference/state' },
            { text: 'Instance methods', link: '/reference/instance' },
          ],
        },
        {
          text: 'Adapters',
          items: [
            { text: '@chat-scroll/react', link: '/reference/react' },
            { text: '@chat-scroll/vue', link: '/reference/vue' },
            { text: '@chat-scroll/solid', link: '/reference/solid' },
          ],
        },
      ],
      '/recipes/': [
        {
          text: 'Recipes',
          items: [
            { text: 'Index', link: '/recipes/' },
            {
              text: 'AI chat with streaming',
              link: '/recipes/ai-streaming',
            },
            {
              text: 'Slack-style scroll lock',
              link: '/recipes/slack-style',
            },
            {
              text: 'Scroll-to-bottom button',
              link: '/recipes/scroll-fab',
            },
            {
              text: 'Multi-thread switching',
              link: '/recipes/multi-thread',
            },
            {
              text: 'Tight pin (sub-pixel)',
              link: '/recipes/tight-pin',
            },
            {
              text: 'Prev / next navigation',
              link: '/recipes/message-navigation',
            },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/flintc/chat-scroll' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026',
    },

    search: {
      provider: 'local',
    },

    editLink: {
      pattern:
        'https://github.com/flintc/chat-scroll/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
})
