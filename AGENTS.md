# AGENTS.md

## Project Goal

- Build from `src/main.ts` into a single-line JavaScript output at `dist/main.js`.

## Stack

- Runtime/package manager: Bun
- Lint: oxlint
- Format: oxfmt
- Transpile: oxc-transform
- Minify (single line): oxc-minify

## Commands

- Install dependencies: `bun install`
- Format: `bun run format`
- Lint: `bun run lint`
- Build: `bun run build`
- Full check (format + lint + build): `bun run check`

## Build Pipeline

1. Read `src/main.ts`
2. Transpile TS -> JS with `oxc-transform`
3. Minify with `oxc-minify`
4. Strip line breaks and write to `dist/main.js`

## Notes

- Keep source in `src/main.ts`.
- Output must remain one line (`newlineCount = 0`).
