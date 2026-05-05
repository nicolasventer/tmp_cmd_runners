from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
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


def stream_process(process_id: str, command: str):
    try:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            shell=True,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP
        )

        processes[process_id] = process

        if process.stdout is None:
            raise Exception("Failed to capture stdout")

        for line in iter(process.stdout.readline, ''):
            yield line

        process.stdout.close()
        process.wait()

    finally:
        processes.pop(process_id, None)


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
        # 🔥 Kill entire process tree (Windows)
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(process.pid)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    processes.pop(id, None)

    return {"status": "stopped"}
