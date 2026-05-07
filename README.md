## CommandRunners

CommandRunners is a small full-stack app for launching shell commands from a browser UI, watching their output stream in real time, and organizing multiple command panels in a draggable, resizable grid.

> [!WARNING]
> This application is intended to be run **LOCALLY ONLY**.
> _It can execute arbitrary shell commands and therefore gives full access to the operating system account running it._
> _Do not expose it to untrusted users or public networks._

It is split into:

- a `client` app built with React, Bun, GridStack, and Monaco
- a `server` app built with FastAPI that starts and stops processes

## What It Does

- Run commands from a browser-based dashboard
- Stream stdout and stderr into each runner panel
- Open multiple runners at once
- Drag and resize runners with GridStack
- Stop a running process from the UI
- Optionally apply a custom JavaScript transform to the streamed output

## Architecture

### Client

The frontend lives in `client/` and provides the command runner interface. Each runner keeps track of:

- the command to execute
- the streamed output
- whether the process is running
- an optional transform function for post-processing output

The UI expects the backend to be available at `http://localhost:8000`.

### Server

The backend lives in `server/` and exposes two HTTP endpoints:

- `GET /run?id=<id>&cmd=<command>` to start a command and stream its output
- `GET /stop?id=<id>` to stop a running command by its runner ID

The current implementation stores active processes in memory and uses OS-specific process-group handling so commands can be stopped on both Windows and Linux.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/)
- Python 3.10+
- [`pipx`](https://pipx.pypa.io/)

### 1. Start the backend

From `server/`:

```bash
pipx install "fastapi[standard]"
fastapi dev main.py --host 127.0.0.1 --port 8000
```

The backend stop flow is designed to work on both Windows and Linux.

### 2. Start the frontend

From `client/`:

```bash
bun install
bun --hot index.html
```

Then open the local URL shown by Bun in your browser.

## Usage

1. Click `Add Runner`.
2. Enter a shell command.
3. Press `Run`, or use `Ctrl+Enter` inside the command box.
4. Watch the output stream live.
5. Use `Stop` to terminate the process.
6. Use `Show Transform` to open the Monaco editor and provide a JavaScript function that rewrites the output.

Example transform module:

```js
export default function transform(output) {
	return output.toUpperCase();
}
```

## Project Structure

```text
CommandRunners/
  client/   # React + Bun frontend
  server/   # FastAPI backend
```

## Limitations

- The backend currently allows arbitrary shell command execution.
- There is no authentication or authorization layer.
- CORS is fully open in the current server implementation.
- Running processes are tracked in memory only.
- Stop-process behavior depends on platform-specific process-group APIs, so edge cases may still vary slightly between shells and operating systems.
- The frontend currently targets a backend at `http://localhost:8000` with no environment-based configuration.

## Security Notice

This project should be treated as a local development tool, not a production-ready remote execution service. Do not expose the current backend directly to untrusted users or public networks.

## Development Notes

- The frontend is built around Bun's HTML entrypoint workflow.
- The server streams command output through `StreamingResponse`.
- Output transforms are loaded dynamically from a JavaScript module entered in the UI.
