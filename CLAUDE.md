# CLAUDE.md

## Project

Polar Signals Profiler — a VS Code extension that displays inline profiling annotations from Parca or Polar Signals Cloud. TypeScript, esbuild, pnpm.

## Commands

```bash
pnpm run compile      # Dev build with sourcemaps
pnpm run watch        # Dev build + watch
pnpm run typecheck    # tsc --noEmit
pnpm run lint         # ESLint on src/
pnpm run build        # Production build
pnpm run package      # Build + vsce package
```

No test suite exists.

## Architecture

Entry point is `src/extension.ts`. Modules under `src/`:

- **api/** — gRPC client wrapping `@parca/client` QueryService
- **annotations/** — Editor decorations (heat map coloring, hover tooltips)
- **auth/** — OAuth provider for Polar Signals Cloud (PKCE flow)
- **commands/** — Command handlers registered in `extension.ts`
- **config/** — Settings cache, reads from `vscode.workspace.getConfiguration`
- **converters/** — Arrow IPC deserialization (flechette library)
- **filters/** — Profile filter URL-safe encoding/decoding
- **generated/** — Protobuf-ts generated code (do not edit)
- **onboarding/** — Setup wizard (cloud vs OSS mode)
- **presets/** — Built-in + user query presets
- **repository/** — Git repo mapping and multi-strategy file resolution
- **state/** — In-memory session cache (per-file profiles, last query config)
- **types/** — Shared TypeScript type declarations
- **ui/** — Status bar, query configurator quick-pick flows
- **uri/** — Deep link handler (`/configure` action)

## Code Style

- **Flat functions over classes.** Only UI components with lifecycle use classes (`ProfilingAnnotations`, `QueryConfigurator`, `ProfileStatusBar`). Everything else is plain exported functions.
- **Singleton getters** for shared instances: `getAnnotations()`, `getStatusBar()`, `getProfilerClient()`.
- **Minimal state.** Prefer reading from VS Code config/globalState. In-memory cache only where needed (session store).
- **No defensive validation** for internal code. Trust VS Code API inputs. Only validate at system boundaries (user input, API responses).
- **No over-abstraction.** No barrel exports, no class wrappers where functions suffice.

## TypeScript

- Strict mode enabled. Target ES2020, CommonJS output.
- Use `import type` for type-only imports (enforced by eslint `consistent-type-imports`).
- Prefix unused params with `_` (eslint `argsIgnorePattern: '^_'`).
- `any` is a warning, not an error — avoid it but don't fight the linter when wrapping untyped externals.

## Formatting

Prettier with: `printWidth: 100`, `singleQuote: true`, `bracketSpacing: false`, `arrowParens: 'avoid'`. Enforced via husky + lint-staged on commit.

## Generated Code

`src/generated/` is protobuf-ts output. ESLint ignores it. Never edit these files manually.

## Key Patterns

- Commands follow the pattern: gather config → call API → update annotations. See `commands/fetch-profile.ts`.
- gRPC transport uses `GrpcWebFetchTransport` with binary format. Auth headers added via `interceptors` in cloud mode.
- Arrow responses are LZ4-compressed; decompressed + parsed with `@uwdata/flechette`.
- Console logs use `[Polar Signals]` prefix.
- User-facing errors go through `vscode.window.showErrorMessage()`.
- Two modes: `cloud` (OAuth + project ID) and `oss` (no auth, self-hosted Parca URL).
