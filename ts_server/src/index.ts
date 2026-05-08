import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import embeddedIndexHtml from "../index.html" with { type: "text" };
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

type Layout = {
  x?: number;
  y?: number;
  w: number;
  h: number;
};

type Runner = {
  command: string;
  transform: string;
  applyTransform: boolean;
  layout: Layout;
};

type AppState = {
  idToRunner: Record<string, Runner>;
};

type RenameStateRequest = {
  old_filename: string;
  new_filename: string;
};

type ManagedProcess = ChildProcess;

const SOURCE_SERVER_DIR = resolve(import.meta.dir, "..");
const EXECUTABLE_DIR = dirname(process.execPath);
const TS_SERVER_DIR = existsSync(resolve(SOURCE_SERVER_DIR, "package.json"))
  ? SOURCE_SERVER_DIR
  : EXECUTABLE_DIR;
const INDEX_HTML = resolve(TS_SERVER_DIR, "index.html");
const STATES_DIR = resolve(TS_SERVER_DIR, "states");
const EMBEDDED_INDEX_HTML = embeddedIndexHtml as unknown as string;

const processes = new Map<string, ManagedProcess>();

await mkdir(STATES_DIR, { recursive: true });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLayout(value: unknown): value is Layout {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.w === "number" &&
    Number.isFinite(value.w) &&
    typeof value.h === "number" &&
    Number.isFinite(value.h) &&
    (value.x === undefined || (typeof value.x === "number" && Number.isFinite(value.x))) &&
    (value.y === undefined || (typeof value.y === "number" && Number.isFinite(value.y)))
  );
}

function isRunner(value: unknown): value is Runner {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.command === "string" &&
    typeof value.transform === "string" &&
    typeof value.applyTransform === "boolean" &&
    isLayout(value.layout)
  );
}

function isAppState(value: unknown): value is AppState {
  if (!isRecord(value) || !isRecord(value.idToRunner)) {
    return false;
  }

  return Object.values(value.idToRunner).every(isRunner);
}

function isRenameStateRequest(value: unknown): value is RenameStateRequest {
  return (
    isRecord(value) &&
    typeof value.old_filename === "string" &&
    typeof value.new_filename === "string"
  );
}

function buildStateFilename(filename: string): string {
  const cleaned = filename.trim();

  if (!cleaned) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `state-${timestamp}.json`;
  }

  const safeName = basename(cleaned);
  if (!safeName) {
    throw new Error("Invalid filename");
  }

  return safeName.endsWith(".json") ? safeName : `${safeName}.json`;
}

function requireStateFilename(filename: string): string {
  const cleaned = filename.trim();
  if (!cleaned) {
    throw new Error("Filename required");
  }

  return buildStateFilename(cleaned);
}

function getStatePath(filename: string): string {
  return resolve(STATES_DIR, requireStateFilename(filename));
}

function registerProcess(processId: string, child: ManagedProcess): void {
  processes.set(processId, child);
}

function getProcess(processId: string): ManagedProcess | undefined {
  return processes.get(processId);
}

function takeProcess(processId: string): ManagedProcess | undefined {
  const child = processes.get(processId);
  if (child) {
    processes.delete(processId);
  }
  return child;
}

function popProcessIfSame(processId: string, child: ManagedProcess): void {
  if (processes.get(processId) === child) {
    processes.delete(processId);
  }
}

function isProcessRunning(child: ManagedProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}

function waitForProcessExit(child: ManagedProcess, timeoutMs: number): Promise<boolean> {
  if (!isProcessRunning(child)) {
    return Promise.resolve(true);
  }

  return new Promise((resolvePromise) => {
    const onClose = () => {
      cleanup();
      resolvePromise(true);
    };

    const timer = setTimeout(() => {
      cleanup();
      resolvePromise(!isProcessRunning(child));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      child.off("close", onClose);
    };

    child.once("close", onClose);
  });
}

function runProcess(command: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: "ignore",
      windowsHide: true,
    });

    child.once("error", rejectPromise);
    child.once("close", () => resolvePromise());
  });
}

async function runTaskkill(child: ManagedProcess, force: boolean): Promise<void> {
  if (!child.pid) {
    return;
  }

  const args = force
    ? ["/F", "/T", "/PID", String(child.pid)]
    : ["/T", "/PID", String(child.pid)];

  await runProcess("taskkill", args);
}

async function stopProcessTree(child: ManagedProcess): Promise<void> {
  if (!child.pid || !isProcessRunning(child)) {
    return;
  }

  if (process.platform === "win32") {
    try {
      await runTaskkill(child, false);
      if (await waitForProcessExit(child, 2_000)) {
        return;
      }
    } catch (error) {
      const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
      if (code === "ENOENT") {
        child.kill("SIGTERM");
        if (await waitForProcessExit(child, 2_000)) {
          return;
        }
      }
    }

    try {
      await runTaskkill(child, true);
      if (await waitForProcessExit(child, 5_000)) {
        return;
      }
    } catch (error) {
      const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
      if (code === "ENOENT") {
        child.kill("SIGKILL");
        if (await waitForProcessExit(child, 5_000)) {
          return;
        }
      }
    }

    if (!isProcessRunning(child)) {
      return;
    }

    throw new Error(`Failed to stop process tree for PID ${child.pid}`);
  }

  process.kill(-child.pid, "SIGTERM");
  if (await waitForProcessExit(child, 5_000)) {
    return;
  }

  process.kill(-child.pid, "SIGKILL");
  await waitForProcessExit(child, 5_000);
}

function streamProcess(processId: string, command: string): Response {
  let child: ManagedProcess | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let settled = false;
      const encoder = new TextEncoder();

      const closeStream = () => {
        if (settled) {
          return;
        }

        settled = true;
        controller.close();
      };

      const failStream = (error: unknown) => {
        if (settled) {
          return;
        }

        settled = true;
        controller.error(error);
      };

      try {
        child = spawn(command, {
          shell: true,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          detached: process.platform !== "win32",
        });
      } catch (error) {
        failStream(error);
        return;
      }

      registerProcess(processId, child);

      if (!child.stdout || !child.stderr) {
        popProcessIfSame(processId, child);
        failStream(new Error("Failed to capture process output"));
        return;
      }

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");

      const onData = (chunk: string) => {
        if (settled) {
          return;
        }

        controller.enqueue(encoder.encode(chunk));
      };

      const onError = (error: unknown) => {
        popProcessIfSame(processId, child!);
        failStream(error);
      };

      const onClose = () => {
        popProcessIfSame(processId, child!);
        closeStream();
      };

      child.stdout.on("data", onData);
      child.stderr.on("data", onData);
      child.once("error", onError);
      child.once("close", onClose);
    },
    cancel() {
      // Keep the process running if the browser stops reading.
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

function jsonError(
  set: { status?: number | string },
  statusCode: number,
  detail: string,
): { detail: string } {
  set.status = statusCode;
  return { detail };
}

function getIndexHtmlResponse(): Response {
  if (existsSync(INDEX_HTML)) {
    return new Response(Bun.file(INDEX_HTML), {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  }

  return new Response(EMBEDDED_INDEX_HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

const app = new Elysia()
  .use(
    cors({
      origin: true,
      methods: "*",
      allowedHeaders: true,
    }),
  )
  .get("/", () => getIndexHtmlResponse())
  .get("/index.html", () => getIndexHtmlResponse())
  .get("/run", ({ query, set }) => {
    const cmd = typeof query.cmd === "string" ? query.cmd : "";
    const processId = typeof query.id === "string" ? query.id : "";

    if (!cmd) {
      return jsonError(set, 400, "Command required");
    }

    if (!processId) {
      return jsonError(set, 400, "Process id required");
    }

    return streamProcess(processId, cmd);
  })
  .get("/stop", async ({ query, set }) => {
    const processId = typeof query.id === "string" ? query.id : "";
    if (!processId) {
      return jsonError(set, 400, "Process id required");
    }

    const child = takeProcess(processId);
    if (!child) {
      return jsonError(set, 404, "Process not found");
    }

    try {
      await stopProcessTree(child);
    } catch (error) {
      if (isProcessRunning(child)) {
        registerProcess(processId, child);
      }

      const message = error instanceof Error ? error.message : String(error);
      return jsonError(set, 500, message);
    }

    return { status: "stopped" };
  })
  .post("/state", async ({ body, query, set }) => {
    if (!isAppState(body)) {
      return jsonError(set, 400, "Invalid app state");
    }

    let filename: string;
    try {
      filename = buildStateFilename(typeof query.filename === "string" ? query.filename : "");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonError(set, 400, message);
    }

    const statePath = resolve(STATES_DIR, filename);

    try {
      await writeFile(statePath, JSON.stringify(body, null, 2), "utf8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonError(set, 500, message);
    }

    return {
      status: "saved",
      filename,
      path: statePath,
    };
  })
  .get("/states", async () => {
    const files = await readdir(STATES_DIR, { withFileTypes: true });

    return {
      files: files
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right)),
    };
  })
  .get("/state", async ({ query, set }) => {
    const filename = typeof query.filename === "string" ? query.filename : "";

    let statePath: string;
    try {
      statePath = getStatePath(filename);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonError(set, 400, message);
    }

    if (!existsSync(statePath)) {
      return jsonError(set, 404, "State file not found");
    }

    try {
      return JSON.parse(await readFile(statePath, "utf8"));
    } catch (error) {
      const message = error instanceof SyntaxError
        ? `Invalid state file JSON: ${error.message}`
        : error instanceof Error
          ? error.message
          : String(error);

      return jsonError(set, 500, message);
    }
  })
  .post("/state/rename", async ({ body, set }) => {
    if (!isRenameStateRequest(body)) {
      return jsonError(set, 400, "Invalid rename request");
    }

    let oldPath: string;
    let newFilename: string;

    try {
      oldPath = getStatePath(body.old_filename);
      newFilename = requireStateFilename(body.new_filename);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonError(set, 400, message);
    }

    const newPath = resolve(STATES_DIR, newFilename);

    if (!existsSync(oldPath)) {
      return jsonError(set, 404, "State file not found");
    }

    if (existsSync(newPath)) {
      return jsonError(set, 409, "Target state file already exists");
    }

    try {
      await rename(oldPath, newPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonError(set, 500, message);
    }

    return {
      status: "renamed",
      old_filename: basename(oldPath),
      new_filename: newFilename,
      path: newPath,
    };
  })
  .delete("/state", async ({ query, set }) => {
    const filename = typeof query.filename === "string" ? query.filename : "";

    let statePath: string;
    try {
      statePath = getStatePath(filename);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonError(set, 400, message);
    }

    if (!existsSync(statePath)) {
      return jsonError(set, 404, "State file not found");
    }

    try {
      await rm(statePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonError(set, 500, message);
    }

    return {
      status: "deleted",
      filename: basename(statePath),
    };
  });

const port = Number(process.env.PORT ?? 8000);
const hostname = process.env.HOST ?? "127.0.0.1";

app.listen({
  hostname,
  port,
});

console.log(`CommandRunners TS server listening on http://${hostname}:${port}`);
console.log(`Serving frontend from ${INDEX_HTML}`);
console.log(`Using state directory ${STATES_DIR}`);
console.log(`Server source directory ${TS_SERVER_DIR}`);
