# Client

This is the frontend for CommandRunners. It renders a browser dashboard where each panel can run a shell command, stream output, apply an optional JavaScript transform, and participate in a saved dashboard layout.

## Stack

- React 19
- Bun
- GridStack
- Monaco Editor
- `autosize`

## Requirements

- [Bun](https://bun.sh/)
- A running backend at `http://localhost:8000`

## Install

```bash
bun install
```

## Run In Development

```bash
bun --hot index.html
```

Bun serves the app locally with hot reload.

## Build

Example Bun build command:

```bash
bun build --outdir ./out index.html
```

## UI Features

- Add and remove runner panels
- Drag and resize panels with GridStack
- Run commands with the `Run` button or `Ctrl+Enter`
- Stream output live from the backend
- Stop running commands
- Pause the displayed output while a process keeps running
- Resume back to the live stream after pausing
- Auto-scroll while following the latest output
- Jump back to the bottom after scrolling up
- Maximize output into a modal view and close it with `Escape`
- Open a Monaco editor panel for output transforms

## Saved State Workflow

The header controls manage server-backed JSON state files:

- `new`: work with an unsaved dashboard
- `Refresh`: reload the available saved files
- `Load`: replace the current dashboard with the selected saved state
- `Save`: create or overwrite a saved state file
- `Rename`: rename the selected saved file
- `Delete`: remove the selected saved file
- `Clear`: when `new` is selected, clear all current runners

Each saved state stores:

- the runners currently on the page
- each runner's command text
- each runner's transform source
- each runner's transform enabled flag
- each runner's GridStack layout (`x`, `y`, `w`, `h`)

Saved states do not restore live output or restart running processes.

## Transform Function

The transform editor expects a default-exported JavaScript function:

```js
export default function transform(output) {
  return output;
}
```

When enabled, the function receives the accumulated output string and returns the text shown in the output panel. If the transform fails to load, the UI disables it and shows an error.

## Notes

- The backend URL is currently hardcoded to `http://localhost:8000`.
- Command input is sent as a single command string.
- Multi-line command text is flattened into a single line before being sent to the backend.
- Transform code runs in the browser by loading a generated JavaScript module.
- This frontend is intended for local use alongside the companion FastAPI server.
