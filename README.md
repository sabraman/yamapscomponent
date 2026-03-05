# Yandex Geosuggest with shadcn/ui

This project contains a Yandex geosuggest search bar implemented with `ymaps.SuggestView` and wrapped in shadcn UI primitives.

## What is initialized

- Vite + React + TypeScript scaffold.
- Tailwind CSS with shadcn-compatible CSS variables.
- shadcn `components.json` with registry namespace:
  - `@shadcn` -> `https://ui.shadcn.com/r/{name}.json`
- shadcn-style components: `button`, `badge`, `card`, `input`, `label`.
- `GeoSuggestSearch` component that dynamically loads Yandex JS API and binds SuggestView to the input.

## API keys

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Variables used:

- `VITE_YANDEX_JS_API_KEY`
- `VITE_YANDEX_SUGGEST_API_KEY`

## Install and run

```bash
npm install
npm run dev
```

## Type check

```bash
npm run typecheck
```

## Delivery routing rules

Delivery assignment logic is implemented in `src/lib/delivery-routing.ts`:

- Central district: stable split between:
  - `ул. Егорова, 14`
  - `ул. Ленина, 16а`
- Leninsky district:
  - `пр. Героев-Североморцев, 58`
- Pervomaysky district: stable split between:
  - `ул. Шевченко, 7б`
  - `пр. Кольский, 57`

If district detection fails, fallback assigns to the central pool with stable split.
