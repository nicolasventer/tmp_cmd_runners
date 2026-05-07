# Server

This is the FastAPI backend for CommandRunners. It starts shell commands, streams their output back to the client, allows a running command to be stopped by ID, and persists saved frontend dashboard states as JSON files.

## Requirements

- Python 3.10+
- [`pipx`](https://pipx.pypa.io/)

## Setup

```bash
pipx install "fastapi[standard]"
```

If you already have `fastapi` installed another way, you can keep using that.

## Run

From the `server/` directory:

```bash
fastapi dev main.py --host 127.0.0.1 --port 8000
```

## API

### `GET /run`

Starts a command and streams the combined stdout/stderr response.

Query parameters:

- `id`: unique runner identifier supplied by the frontend
- `cmd`: shell command to execute

Example:

```text
/run?id=123&cmd=python%20--version
```

### `GET /stop`

Stops a running process associated with a runner ID.

Query parameters:

- `id`: runner identifier

Example:

```text
/stop?id=123
```

### `POST /state`

Stores the full frontend app state as JSON under `server/states/`.

Query parameters:

- `filename`: optional output filename. If omitted or empty, the server generates one automatically.

Request body:

```json
{
  "idToRunner": {
    "123": {
      "command": "python --version",
      "transform": "",
      "layout": {
        "w": 6,
        "h": 3
      }
    }
  }
}
```

Example:

```text
POST /state?filename=session-1
```

Response shape:

```json
{
  "status": "saved",
  "filename": "session-1.json",
  "path": "C:/.../server/states/session-1.json"
}
```

### `GET /states`

Lists all saved state files from `server/states/`.

Response shape:

```json
{
  "files": ["session-1.json", "state-20260507-030000.json"]
}
```

### `GET /state`

Returns the parsed JSON content of a saved global state file.

Query parameters:

- `filename`: state filename to load

Example:

```text
/state?filename=session-1.json
```

Notes:

- Filenames are normalized to stay inside `server/states/`.
- Omitting `.json` still resolves to the matching JSON filename.

### `POST /state/rename`

Renames a saved state file inside `server/states/`.

Request body:

```json
{
  "old_filename": "session-1.json",
  "new_filename": "session-2"
}
```

Response shape:

```json
{
  "status": "renamed",
  "old_filename": "session-1.json",
  "new_filename": "session-2.json",
  "path": "C:/.../server/states/session-2.json"
}
```

## Implementation Notes

- Active processes are stored in an in-memory dictionary keyed by runner ID.
- Command output is streamed with FastAPI's `StreamingResponse`.
- The server merges stderr into stdout before sending output back to the client.
- CORS is currently open to all origins, methods, and headers.
- Saved app states are written as JSON files in `server/states/`.
- State management endpoints validate filenames and keep all file access scoped to `server/states/`.
- Saved state data includes runner configuration and layout, but not live process state or streamed output history.

## Platform Notes

The backend now uses platform-appropriate process-tree handling so the stop endpoint works on both Windows and Linux:

- Windows stops the target process tree with `taskkill /T /PID ...` and falls back to `taskkill /F /T /PID ...` if a graceful stop does not finish quickly.
- Linux starts commands in a new session and terminates the process group with `SIGTERM`, followed by `SIGKILL` only if needed.

## Security Warning

This server executes arbitrary shell commands received over HTTP. It is suitable only for trusted local development unless you add authentication, authorization, input controls, and a safer execution model.
