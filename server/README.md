# Server

This is the FastAPI backend for CommandRunners. It starts shell commands, streams their output back to the client, stops running processes by runner ID, and persists saved dashboard states as JSON files.

## Requirements

- Python 3.10+
- FastAPI CLI support via `fastapi[standard]`

## Setup

```bash
python -m pip install "fastapi[standard]"
```

If you prefer `pipx`, that works as well:

```bash
pipx install "fastapi[standard]"
```

## Run

From the `server/` directory:

```bash
fastapi dev main.py --host 127.0.0.1 --port 8000
```

The server creates `server/states/` automatically if it does not already exist.

## API

### `GET /run`

Starts a shell command and streams combined stdout and stderr as plain text.

Query parameters:

- `id`: unique runner identifier supplied by the frontend
- `cmd`: shell command to execute

Example:

```text
/run?id=123&cmd=python%20--version
```

Validation:

- returns `400` if `cmd` is empty

### `GET /stop`

Stops the running process associated with a runner ID.

Query parameters:

- `id`: runner identifier

Example:

```text
/stop?id=123
```

Responses:

- `200` with `{"status":"stopped"}`
- `404` if the process is not found
- `500` if stop handling fails

### `POST /state`

Stores the full frontend app state as JSON under `server/states/`.

Query parameters:

- `filename`: optional output filename; if omitted or empty, the server generates one automatically

Request body:

```json
{
  "idToRunner": {
    "123": {
      "command": "python --version",
      "transform": "",
      "applyTransform": false,
      "layout": {
        "w": 6,
        "h": 3
      }
    }
  }
}
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

Returns the parsed JSON content of a saved state file.

Query parameters:

- `filename`: state filename to load

Example:

```text
/state?filename=session-1.json
```

Notes:

- filenames are normalized to stay inside `server/states/`
- omitting `.json` still resolves to the matching JSON filename
- returns `404` if the file does not exist

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

### `DELETE /state`

Deletes a saved state file from `server/states/`.

Query parameters:

- `filename`: state filename to delete

Example:

```text
/state?filename=session-2.json
```

Response shape:

```json
{
  "status": "deleted",
  "filename": "session-2.json"
}
```

## Implementation Notes

- Active processes are stored in an in-memory dictionary keyed by runner ID.
- Command output is streamed with FastAPI's `StreamingResponse`.
- The server merges stderr into stdout before streaming output.
- CORS is open to all origins, methods, and headers.
- Saved app states are written as JSON files in `server/states/`.
- State-management endpoints validate filenames and keep file access scoped to `server/states/`.
- Saved state data includes runner configuration and layout, but not live process state or output history.

## Platform Notes

The backend uses platform-specific process-tree handling so `stop` works on both Windows and Linux:

- Windows uses `taskkill /T /PID ...` and falls back to `taskkill /F /T /PID ...` if needed.
- Linux starts commands in a new session and terminates the process group with `SIGTERM`, followed by `SIGKILL` only if needed.

## Security Warning

This server executes arbitrary shell commands received over HTTP. It is suitable only for trusted local development unless you add authentication, authorization, input controls, and a safer execution model.
