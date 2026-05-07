import type { OnMount } from "@monaco-editor/react";
import { Editor } from "@monaco-editor/react";
import autosize from "autosize";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { Runner } from "./AppState";

export type CommandRunnerProps = {
	id: string;
	command: string;
	transform: string;
	updateRunner: (id: string, updates: Partial<Runner>) => void;
	onRemove: (id: string) => void;
};

export const CommandRunner = memo(({ id, command, transform, updateRunner, onRemove }: CommandRunnerProps) => {
	/* -------------------- STATE -------------------- */
	const [output, setOutput] = useState("");

	const [running, setRunning] = useState(false);
	const [stopping, setStopping] = useState(false);
	const [processId, setProcessId] = useState<string | null>(null);

	const [bShowTransform, setBShowTransform] = useState(false);
	const [bApplyingTransform, setBApplyingTransform] = useState(false);

	const [editorHandle, setEditorHandle] = useState({ x: 0, y: 0 });

	const [isAtBottom, setIsAtBottom] = useState(true);

	/* -------------------- REFS -------------------- */
	const transformFn = useRef<{
		url: string;
		fn: (output: string) => string;
	} | null>(null);

	const observer = useRef<ResizeObserver | null>(null);
	const editorRef = useRef<Parameters<OnMount>[0]>(null);

	const parentRef = useRef<HTMLDivElement>(null);
	const otherRef = useRef<HTMLDivElement>(null);
	const runnerRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const outputRef = useRef<HTMLPreElement>(null);
	const stopInFlightRef = useRef(false);

	/* -------------------- TRANSFORM -------------------- */
	const setApplyTransform = async (applying: boolean) => {
		if (!applying) {
			setBApplyingTransform(false);

			if (transformFn.current) {
				URL.revokeObjectURL(transformFn.current.url);
				transformFn.current = null;
			}
			return;
		}

		const blob = new Blob([transform], { type: "text/javascript" });
		const url = URL.createObjectURL(blob);
		const module = await import(url);

		transformFn.current = { url, fn: module.default };
		setBApplyingTransform(true);
	};

	/* -------------------- COMMAND -------------------- */
	const runCommand = async () => {
		if (running || stopping) return;

		setOutput("");
		setIsAtBottom(true);
		setRunning(true);
		setStopping(false);

		const pid = Date.now().toString();
		setProcessId(pid);

		try {
			const response = await fetch(`http://localhost:8000/run?id=${pid}&cmd=${encodeURIComponent(command.replace(/\n/g, " "))}`);

			if (!response.body) return;

			const reader = response.body.getReader();
			const decoder = new TextDecoder("utf-8");

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value, { stream: true });

				setOutput((prev) => (transformFn.current ? transformFn.current.fn(prev + chunk) : prev + chunk));
			}

			setOutput((prev) => prev + decoder.decode());
		} catch (err) {
			setOutput(err instanceof Error ? "Error: " + err.message : "Unknown error");
		}

		setRunning(false);
		setStopping(false);
		setProcessId(null);
	};

	const stopCommand = async () => {
		const pid = processId;
		if (!pid || stopInFlightRef.current) return;

		stopInFlightRef.current = true;
		setStopping(true);

		try {
			const response = await fetch(`http://localhost:8000/stop?id=${encodeURIComponent(pid)}`);
			if (!response.ok && response.status !== 404) {
				throw new Error(`Failed to stop process (${response.status})`);
			}

			setOutput((prev) => {
				if (prev.endsWith("\n[Stopped]\n") || prev === "[Stopped]\n") {
					return prev;
				}

				const separator = prev.length === 0 || prev.endsWith("\n") ? "" : "\n";
				return `${prev}${separator}[Stopped]\n`;
			});
			setRunning(false);
			setProcessId((current) => (current === pid ? null : current));
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setOutput((prev) => {
				const separator = prev.length === 0 || prev.endsWith("\n") ? "" : "\n";
				return `${prev}${separator}[Stop failed: ${message}]\n`;
			});
		} finally {
			setStopping(false);
			stopInFlightRef.current = false;
		}
	};

	/* -------------------- AUTO SCROLL -------------------- */
	useEffect(() => {
		if (!isAtBottom) return;

		const el = outputRef.current;
		if (!el) return;

		el.scrollTop = el.scrollHeight;
	}, [output]);

	const scrollToBottom = () => {
		const el = outputRef.current;
		if (!el) return;

		el.scrollTo({
			top: el.scrollHeight,
			behavior: "smooth",
		});

		setIsAtBottom(true);
	};

	/* -------------------- RESIZE -------------------- */
	const runnerObserver = useMemo(
		() =>
			new ResizeObserver((entries) => {
				if (!entries.length) return;

				const parentRect = parentRef.current?.getBoundingClientRect();
				const otherRect = otherRef.current?.getBoundingClientRect();

				if (!parentRect || !otherRect) return;

				const x = otherRect.x - parentRect.x;
				const y = otherRect.y - parentRect.y;

				setEditorHandle({ x, y });
			}),
		[],
	);

	useEffect(() => {
		if (!runnerRef.current || !textareaRef.current) return;

		runnerObserver.observe(runnerRef.current);
		runnerObserver.observe(textareaRef.current);

		return () => runnerObserver.disconnect();
	}, [runnerObserver]);

	/* -------------------- EDITOR -------------------- */
	const handleEditorMount: OnMount = (editor) => {
		editorRef.current = editor;
		editor.onMouseDown((e) => e.event.stopPropagation());

		observer.current = new ResizeObserver((entries) =>
			entries.forEach((e) =>
				editor.layout({
					width: e.contentRect.width,
					height: e.contentRect.height,
				}),
			),
		);

		const transformZoneParent = document.getElementById(`ghost-editor-${id}`);
		if (transformZoneParent) observer.current.observe(transformZoneParent);
	};

	const onCommandChange = (id: string, command: string) => updateRunner(id, { command });
	const onTransformChange = (id: string, transform: string) => updateRunner(id, { transform });
	const transformToggleVariant = bApplyingTransform ? "info" : transform.trim() ? "warning" : "secondary";

	/* -------------------- UI -------------------- */
	return (
		<div className="runner" ref={runnerRef}>
			{/* COMMAND INPUT */}
			<div className="runner-row">
				<textarea
					ref={textareaRef}
					className="input"
					value={command}
					disabled={running || stopping}
					placeholder="Enter command (Ctrl+Enter to run)"
					onChange={(e) => onCommandChange(id, e.target.value)}
					onKeyDown={(e) => {
						autosize(e.currentTarget);

						if (e.key === "Enter" && e.ctrlKey) {
							e.preventDefault();
							runCommand();
						}
					}}
				/>

				{running ? (
					<button onClick={stopCommand} className="btn danger" disabled={stopping}>
						{stopping ? "Stopping..." : "Stop"}
					</button>
				) : (
					<button onClick={runCommand} className="btn" disabled={stopping}>
						Run
					</button>
				)}

				<button
					className="btn remove"
					onClick={() => {
						stopCommand();
						observer.current?.disconnect();
						onRemove(id);
					}}
				>
					Remove
				</button>
			</div>

			{/* OUTPUT */}
			<div className="runner-output" ref={parentRef}>
				<pre
					ref={outputRef}
					className="output"
					onScroll={() => {
						const el = outputRef.current;
						if (!el) return;

						const threshold = 10;

						const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;

						setIsAtBottom(atBottom);
					}}
				>
					{output || "Output will appear here..."}
				</pre>

				{/* Scroll to bottom button */}
				{!isAtBottom && (
					<button className="scroll-to-bottom" onClick={scrollToBottom}>
						↓
					</button>
				)}

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

								const startHeight = {
									height: el.clientHeight,
									clientY: ev.clientY,
								};

								const moveFn = (ev: PointerEvent) =>
									(el.style.height = `${ev.clientY - startHeight.clientY + startHeight.height}px`);

								document.addEventListener("pointermove", moveFn);
								document.addEventListener("pointerup", () => document.removeEventListener("pointermove", moveFn));
							}}
						/>
					</div>
				</div>
			</div>

			{/* TOGGLE */}
			<button onClick={() => setBShowTransform((prev) => !prev)} className={`btn ${transformToggleVariant}`}>
				{bShowTransform ? "Hide Transform" : "Show Transform"}
			</button>

			{/* TRANSFORM ZONE */}
			<div className="transform-zone" style={{ height: bShowTransform ? "auto" : 0 }}>
				<div style={{ flexGrow: 1, position: "relative" }} id={`ghost-editor-${id}`}>
					<div className="other-custom-resize-handle" ref={otherRef} />
				</div>

				<div style={{ position: "absolute", left: 0, top: 0 }}>
					<Editor
						language="javascript"
						value={transform}
						onChange={(v) => onTransformChange(id, v ?? "")}
						onMount={handleEditorMount}
						options={{ automaticLayout: false }}
					/>
				</div>

				<button
					id={`btn-${id}`}
					disabled={!transform.trim()}
					className={`btn ${bApplyingTransform ? "danger" : ""} apply-transform`}
					onClick={() => setApplyTransform(!bApplyingTransform)}
				>
					{bApplyingTransform ? "Applying..." : "Apply Transform"}
				</button>
			</div>
		</div>
	);
});
CommandRunner.displayName = "CommandRunner";
