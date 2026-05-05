# Client

This is the frontend for CommandRunners. It renders a dashboard where each widget can run a shell command, display its live output, and optionally transform that output with custom JavaScript.

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

## Notes

- The backend URL is currently hardcoded to `http://localhost:8000`.
- Command input is sent as a single-line command string.
- The frontend is intended for local use alongside the companion FastAPI server.
