import type { OnMount } from "@monaco-editor/react";
import { Editor } from "@monaco-editor/react";
import autosize from "autosize";
import { useEffect, useMemo, useRef, useState } from "react";

export default function CommandRunner({ id, onRemove }: { id: string; onRemove: (id: string) => void }) {
	const [cmd, setCmd] = useState("");
	const [output, setOutput] = useState("");
	const [running, setRunning] = useState(false);
	const [processId, setProcessId] = useState<string | null>(null);
	const [bShowTransform, setBShowTransform] = useState(false);
	const [transformOutput, setTransformOutput] = useState("");
	const [bApplyingTransform, setBApplyingTransform] = useState(false);
	const transformFn = useRef<{ url: string; fn: (output: string) => string } | null>(null);

	const setApplyTransform = async (applying: boolean) => {
		if (!applying) {
			setBApplyingTransform(false);
			if (transformFn.current) {
				URL.revokeObjectURL(transformFn.current.url);
				transformFn.current = null;
			}
			return;
		}
		const blob = new Blob([transformOutput], { type: "text/javascript" });
		const url = URL.createObjectURL(blob);
		const module = await import(url);
		const fn = module.default;
		transformFn.current = { url, fn };
		setBApplyingTransform(true);
	};

	const runCommand = async () => {
		setOutput("");
		setRunning(true);

		const pid = Date.now().toString();
		setProcessId(pid);

		try {
			const response = await fetch(`http://localhost:8000/run?id=${pid}&cmd=${encodeURIComponent(cmd.replace(/\n/g, " "))}`);

			if (!response.body) return;

			const reader = response.body.getReader();
			const decoder = new TextDecoder("utf-8");

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value, { stream: true });
				setOutput(transformFn.current?.fn(chunk) ?? ((prev) => prev + chunk));
			}

			setOutput((prev) => prev + decoder.decode());
		} catch (err) {
			setOutput(err instanceof Error ? "Error: " + err.message : "Unknown error");
		}

		setRunning(false);
		setProcessId(null);
	};

	const stopCommand = async () => {
		if (!processId) return;

		await fetch(`http://localhost:8000/stop?id=${processId}`);
		setOutput((prev) => prev + "\n[Stopped]\n");
		setRunning(false);
	};

	const observer = useRef<ResizeObserver>(null);

	const parentRef = useRef<HTMLDivElement>(null);
	const otherRef = useRef<HTMLDivElement>(null);
	const runnerRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [editorHandle, setEditorHandle] = useState({ x: 0, y: 0 });
	const runnerObserver = useMemo(
		() =>
			new ResizeObserver((entries) =>
				entries.forEach((_, i) => {
					if (i !== 0) return;
					const parentRect = parentRef.current?.getBoundingClientRect();
					const otherRect = otherRef.current?.getBoundingClientRect();
					const x = parentRect && otherRect ? otherRect.x - parentRect.x : undefined;
					const y = parentRect && otherRect ? otherRect.y - parentRect.y : undefined;
					if (x && y) setEditorHandle({ x, y });
				}),
			),
		[],
	);

	useEffect(() => {
		if (!runnerRef.current || !textareaRef.current) return;
		runnerObserver.observe(runnerRef.current);
		runnerObserver.observe(textareaRef.current);
		return () => runnerObserver.disconnect();
	}, []);

	const editorRef = useRef<Parameters<OnMount>["0"]>(null);

	return (
		<div className="runner" ref={runnerRef}>
			<div className="runner-row">
				<textarea
					value={cmd}
					onChange={(e) => setCmd(e.target.value)}
					onKeyDown={(e) => {
						autosize(e.currentTarget);
						if (e.key === "Enter" && e.ctrlKey) {
							runCommand();
							e.preventDefault();
						}
					}}
					placeholder="Enter command"
					className="input"
					disabled={running}
					ref={textareaRef}
				/>

				{running ? (
					<button onClick={stopCommand} className="btn danger">
						Stop
					</button>
				) : (
					<button onClick={runCommand} className="btn">
						Run
					</button>
				)}

				<button
					onClick={() => {
						stopCommand();
						observer.current?.disconnect();
						onRemove(id);
					}}
					className="btn remove"
				>
					Remove
				</button>
			</div>
			<div className="runner-output" id={`runner-output-${id}`} ref={parentRef}>
				<pre className="output">{output || "Output will appear here..."}</pre>
				<div className="my-custom-resize-handle">
					<div className="handle" />
					<div
						style={{
							position: "absolute",
							left: editorHandle.x,
							top: editorHandle.y,
							height: bShowTransform ? 16 : 0,
							width: 16,
							zIndex: 50,
							transition: "height .3s",
							overflow: "hidden",
						}}
					>
						<div
							className="handle ghost-handle"
							onPointerDown={(ev) => {
								if (!editorRef.current) return;
								const el = document.getElementById(`btn-${id}`);
								if (!el) return;
								const startHeight = { height: el.clientHeight, clientY: ev.clientY };
								const moveFn = (ev: PointerEvent) =>
									(el.style.height = `${ev.clientY - startHeight.clientY + startHeight.height}px`);
								document.addEventListener("pointermove", moveFn);
								document.addEventListener("pointerup", () => document.removeEventListener("pointermove", moveFn));
							}}
						/>
					</div>
				</div>
			</div>
			<button onClick={() => setBShowTransform((prev) => !prev)} className="btn secondary">
				{bShowTransform ? "Hide Transform" : "Show Transform"}
			</button>
			<div className="transform-zone" style={{ height: bShowTransform ? "auto" : 0 }}>
				<div style={{ flexGrow: 1, position: "relative" }} id={`ghost-editor-${id}`}>
					<div className="other-custom-resize-handle" ref={otherRef} />
				</div>
				<div style={{ position: "absolute", left: 0, top: 0 }}>
					<Editor
						language="javascript"
						value={transformOutput}
						onChange={(value) => setTransformOutput(value ?? "")}
						onMount={(editor) => {
							editorRef.current = editor;
							editor.onMouseDown((e) => e.event.stopPropagation());
							const transformZoneParent = document.getElementById(`ghost-editor-${id}`);
							observer.current = new ResizeObserver((entries) =>
								entries.forEach((e) =>
									editor.layout({
										width: e.contentRect.width,
										height: e.contentRect.height,
									}),
								),
							);
							observer.current!.observe(transformZoneParent!);
						}}
						options={{ automaticLayout: false }}
					/>
				</div>
				<button
					onClick={() => setApplyTransform(!bApplyingTransform)}
					className={`btn ${bApplyingTransform ? "danger" : ""} apply-transform`}
					disabled={!transformOutput.trim()}
					id={`btn-${id}`}
				>
					{bApplyingTransform ? "Applying..." : "Apply Transform"}
				</button>
			</div>
		</div>
	);
}
