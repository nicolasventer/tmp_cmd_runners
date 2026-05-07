# Client

This is the frontend for CommandRunners. It renders a dashboard where each widget can run a shell command, display its live output, optionally transform that output with custom JavaScript, and participate in a saved dashboard state that can be loaded or renamed later.

## Stack

- React
- Bun
- GridStack
- Monaco Editor

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

Bun will serve the app locally and enable hot reloading.

## Build

The source currently includes Bun build examples:

```bash
bun build --outdir ./out index.html
```

## Features

- Add and remove runner panels
- Drag and resize panels with GridStack
- Run commands and stream output live
- Stop running commands
- Save the current dashboard state
- Load a previously saved dashboard state
- Rename saved dashboard state files
- Refresh the saved-state list from the server
- Auto-scroll output while following the latest log lines
- Manually jump back to the bottom when reviewing older output
- Open a Monaco editor panel to define an output transform function

## Transform Function

The transform editor expects a default-exported JavaScript function:

```js
export default function transform(output) {
  return output;
}
```

When enabled, the function receives the accumulated output string and returns the transformed text to display.

## Saved State Workflow

The header controls manage server-backed JSON state files:

- `new`: work with an unsaved dashboard
- `Refresh`: reload the available saved files
- `Load`: replace the current dashboard with the selected saved state
- `Save`: create or overwrite a saved state file
- `Rename`: rename the selected saved file

Each saved state stores:

- the runners currently on the page
- each runner's command text
- each runner's transform source
- each runner's GridStack layout (`x`, `y`, `w`, `h`)

Saved states do not restore live output or restart running processes.

## Notes

- The backend URL is currently hardcoded to `http://localhost:8000`.
- Command input is sent as a single-line command string.
- Multi-line command text is flattened into a single line before it is sent to the backend.
- The frontend is intended for local use alongside the companion FastAPI server.
