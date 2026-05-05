# Server

This is the FastAPI backend for CommandRunners. It starts shell commands, streams their output back to the client, and allows a running command to be stopped by ID.

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

## Implementation Notes

- Active processes are stored in an in-memory dictionary keyed by runner ID.
- Command output is streamed with FastAPI's `StreamingResponse`.
- The server merges stderr into stdout before sending output back to the client.
- CORS is currently open to all origins, methods, and headers.

## Platform Notes

The backend now uses platform-appropriate process-group handling so the stop endpoint works on both Windows and Linux:

- Windows starts commands with `CREATE_NEW_PROCESS_GROUP` and falls back to `taskkill /F /T /PID ...` if a graceful stop does not finish quickly.
- Linux starts commands in a new session and terminates the process group with `SIGTERM`, followed by `SIGKILL` only if needed.

## Security Warning

This server executes arbitrary shell commands received over HTTP. It is suitable only for trusted local development unless you add authentication, authorization, input controls, and a safer execution model.
