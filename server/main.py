from datetime import datetime
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import signal
import subprocess
import os
import json
os.environ["PYTHONIOENCODING"] = "utf-8"

app = FastAPI()
STATES_DIR = Path(__file__).resolve().parent / "states"
STATES_DIR.mkdir(exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

processes = {}


class Layout(BaseModel):
    x: int | None = None
    y: int | None = None
    w: int
    h: int


class Runner(BaseModel):
    command: str
    transform: str
    layout: Layout


class AppState(BaseModel):
    idToRunner: dict[str, Runner]


class RenameStateRequest(BaseModel):
    old_filename: str
    new_filename: str


def pop_process(process_id: str):
    return processes.pop(process_id, None)


def build_popen_kwargs():
    kwargs = {
        "stdout": subprocess.PIPE,
        "stderr": subprocess.STDOUT,
        "text": True,
        "shell": True,
    }

    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True

    return kwargs


def stop_process_tree(process: subprocess.Popen):
    if process.poll() is not None:
        return

    if os.name == "nt":
        try:
            process.send_signal(signal.CTRL_BREAK_EVENT)
            process.wait(timeout=5)
            return
        except Exception:
            pass

        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(process.pid)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        return

    try:
        pgid = os.getpgid(process.pid)
    except ProcessLookupError:
        return

    try:
        os.killpg(pgid, signal.SIGTERM)
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        os.killpg(pgid, signal.SIGKILL)
        process.wait(timeout=5)


def stream_process(process_id: str, command: str):
    try:
        process = subprocess.Popen(command, **build_popen_kwargs())

        processes[process_id] = process

        if process.stdout is None:
            raise Exception("Failed to capture stdout")

        for line in iter(process.stdout.readline, ''):
            yield line

        process.stdout.close()
        process.wait()

    finally:
        pop_process(process_id)


def build_state_filename(filename: str) -> str:
    cleaned = filename.strip()

    if not cleaned:
        return f"state-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"

    cleaned = Path(cleaned).name
    if not cleaned:
        raise HTTPException(status_code=400, detail="Invalid filename")

    if not cleaned.endswith(".json"):
        cleaned = f"{cleaned}.json"

    return cleaned


def require_state_filename(filename: str) -> str:
    cleaned = filename.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Filename required")

    return build_state_filename(cleaned)


def get_state_path(filename: str) -> Path:
    return STATES_DIR / require_state_filename(filename)


@app.get("/run")
def run(cmd: str, id: str):
    if not cmd:
        raise HTTPException(status_code=400, detail="Command required")

    return StreamingResponse(stream_process(id, cmd), media_type="text/plain; charset=utf-8")


@app.get("/stop")
def stop(id: str):
    process = processes.get(id)

    if not process:
        raise HTTPException(status_code=404, detail="Process not found")

    try:
        stop_process_tree(process)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    pop_process(id)

    return {"status": "stopped"}


@app.post("/state")
def save_state(state: AppState, filename: str = ""):
    final_filename = build_state_filename(filename)
    output_path = STATES_DIR / final_filename

    try:
        output_path.write_text(
            json.dumps(state.model_dump(), indent=2),
            encoding="utf-8",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "status": "saved",
        "filename": final_filename,
        "path": str(output_path),
    }


@app.get("/states")
def list_states():
    return {
        "files": sorted(
            file.name
            for file in STATES_DIR.iterdir()
            if file.is_file() and file.suffix == ".json"
        )
    }


@app.get("/state")
def get_state(filename: str):
    state_path = get_state_path(filename)

    if not state_path.exists() or not state_path.is_file():
        raise HTTPException(status_code=404, detail="State file not found")

    try:
        return json.loads(state_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Invalid state file JSON: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/state/rename")
def rename_state(request: RenameStateRequest):
    old_path = get_state_path(request.old_filename)
    new_filename = require_state_filename(request.new_filename)
    new_path = STATES_DIR / new_filename

    if not old_path.exists() or not old_path.is_file():
        raise HTTPException(status_code=404, detail="State file not found")

    if new_path.exists():
        raise HTTPException(status_code=409, detail="Target state file already exists")

    try:
        old_path.rename(new_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "status": "renamed",
        "old_filename": old_path.name,
        "new_filename": new_filename,
        "path": str(new_path),
    }
