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
import threading
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

processes: dict[str, subprocess.Popen] = {}
processes_lock = threading.Lock()


class Layout(BaseModel):
    x: int | None = None
    y: int | None = None
    w: int
    h: int


class Runner(BaseModel):
    command: str
    transform: str
    applyTransform: bool
    layout: Layout


class AppState(BaseModel):
    idToRunner: dict[str, Runner]


class RenameStateRequest(BaseModel):
    old_filename: str
    new_filename: str


def register_process(process_id: str, process: subprocess.Popen):
    with processes_lock:
        processes[process_id] = process


def get_process(process_id: str):
    with processes_lock:
        return processes.get(process_id)


def take_process(process_id: str):
    with processes_lock:
        return processes.pop(process_id, None)


def pop_process_if_same(process_id: str, process: subprocess.Popen):
    with processes_lock:
        if processes.get(process_id) is process:
            processes.pop(process_id, None)


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


def wait_for_process_exit(process: subprocess.Popen, timeout: float):
    try:
        process.wait(timeout=timeout)
        return True
    except subprocess.TimeoutExpired:
        return False


def run_taskkill(process: subprocess.Popen, force: bool):
    command = ["taskkill", "/T", "/PID", str(process.pid)]
    if force:
        command.insert(1, "/F")

    subprocess.run(
        command,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )


def stop_process_tree(process: subprocess.Popen):
    if process.poll() is not None:
        return

    if os.name == "nt":
        try:
            run_taskkill(process, force=False)
            if wait_for_process_exit(process, timeout=2):
                return
        except FileNotFoundError:
            process.terminate()
            if wait_for_process_exit(process, timeout=2):
                return
        except Exception:
            pass

        try:
            run_taskkill(process, force=True)
            if wait_for_process_exit(process, timeout=5):
                return
        except FileNotFoundError:
            process.kill()
            if wait_for_process_exit(process, timeout=5):
                return
        except Exception:
            pass

        if process.poll() is not None:
            return

        raise RuntimeError(f"Failed to stop process tree for PID {process.pid}")

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

        register_process(process_id, process)

        if process.stdout is None:
            raise Exception("Failed to capture stdout")

        for line in iter(process.stdout.readline, ''):
            yield line

        process.stdout.close()
        process.wait()

    finally:
        pop_process_if_same(process_id, process)


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
    process = take_process(id)

    if not process:
        raise HTTPException(status_code=404, detail="Process not found")

    try:
        stop_process_tree(process)
    except Exception as e:
        if process.poll() is None:
            register_process(id, process)
        raise HTTPException(status_code=500, detail=str(e))

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
