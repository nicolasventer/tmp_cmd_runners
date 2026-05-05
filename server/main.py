from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import signal
import subprocess
import os
os.environ["PYTHONIOENCODING"] = "utf-8"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

processes = {}


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
