# linhanning.com

Personal blog and portfolio for Liam Lin, built with Astro and Tailwind CSS.

The site is content-first: long-form writing lives in `src/content/blog`, while the UI is implemented with Astro components and shared layouts.

## Stack

- Astro 5
- Tailwind CSS 4 via `@tailwindcss/vite`
- MDX support via `@astrojs/mdx`
- Sitemap generation via `@astrojs/sitemap`
- RSS feed via `src/pages/rss.xml.ts`

## Local Development

Install dependencies:

```sh
npm install
```

Start the dev server:

```sh
npm run dev
```

Build the production site:

```sh
npm run build
```

Preview the built output:

```sh
npm run preview
```

## Project Structure

```text
/
├── public/
│   ├── avatar-liam.jpeg
│   ├── favicon.ico
│   ├── favicon.png
│   └── ...
├── src/
│   ├── components/
│   ├── content/
│   │   └── blog/
│   ├── data/
│   ├── layouts/
│   ├── pages/
│   └── styles/
├── astro.config.mjs
└── package.json
```

## Content

Blog posts are loaded from `src/content/blog` and validated by `src/content.config.ts`.

Each post supports:

- `title`
- `description`
- `pubDate`
- `updatedDate`
- `tags`
- `heroImage`
- `draft`

Draft posts are excluded from the public blog index.

## Main Entry Points

- Home page: `src/pages/index.astro`
- Blog index: `src/pages/blog/index.astro`
- Blog post layout: `src/layouts/BlogPostLayout.astro`
- Global shell: `src/layouts/BaseLayout.astro`
- Global styles: `src/styles/global.css`
- Shared metadata and favicon tags: `src/components/BaseHead.astro`

## Branding Notes

- The current favicon assets are `public/favicon.png` and `public/favicon.ico`
- The source avatar image used for the favicon is `public/avatar-liam.jpeg`
- `src/components/BaseHead.astro` is the source of truth for favicon links and metadata tags

## Site Metadata

The production site URL is configured in `astro.config.mjs`:

```js
site: "https://linhanning.com"
```
