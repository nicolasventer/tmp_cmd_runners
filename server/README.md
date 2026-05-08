# Server

This directory contains the CommandRunners backend. It is a Bun + Elysia server that:

- serves the app HTML
- starts shell commands and streams their output
- stops running processes by runner ID
- saves dashboard state files under `states/`

## Requirements

- [Bun](https://bun.sh/)

## Install

```bash
bun install
```

## Run In Development

```bash
bun --watch src/index.ts
```

By default the server listens on `http://127.0.0.1:8000`.

You can override the bind address with:

- `HOST`
- `PORT`

Examples:

```bash
HOST=0.0.0.0 PORT=9000 bun run src/index.ts
```

```powershell
$env:HOST="0.0.0.0"
$env:PORT="9000"
bun run src/index.ts
```

## Scripts

- `bun run dev`: watch `src/index.ts`
- `bun run start`: run once
- `bun run typecheck`: run TypeScript checks

## API

### `GET /`

Serves the dashboard HTML.

### `GET /run?id=<id>&cmd=<command>`

Starts a shell command and streams combined stdout and stderr as plain text.

### `GET /stop?id=<id>`

Stops the process registered for that runner ID.

On Windows the server uses `taskkill` when available so child processes are terminated as well.

### `POST /state?filename=<optional-name>`

Saves the dashboard state JSON. If `filename` is omitted, the server creates a timestamp-based name.

### `GET /states`

Returns the list of saved `.json` state files.

### `GET /state?filename=<name>`

Loads a saved state file.

### `POST /state/rename`

Renames a saved state file.

Request body:

```json
{
  "old_filename": "old-name.json",
  "new_filename": "new-name.json"
}
```

### `DELETE /state?filename=<name>`

Deletes a saved state file.

## State Files

State files are stored in `states/` and contain:

- the current runner set
- each runner's command
- transform source
- transform enabled flag
- layout dimensions and position

Running processes and output history are not persisted.

## Notes

- The frontend currently calls the backend at `http://localhost:8000`.
- CORS is enabled broadly for local development.
- This server is not suitable for untrusted or public deployment.
- When compiled, the executable can fall back to embedded HTML if no local `index.html` is present.
