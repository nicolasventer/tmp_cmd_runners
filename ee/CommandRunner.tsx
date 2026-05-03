import autosize from "autosize";
import { useRef, useState } from "react";

export default function CommandRunner({ id, onRemove }: { id: string; onRemove: (id: string) => void }) {
	const [cmd, setCmd] = useState("");
	const [output, setOutput] = useState("");
	const [running, setRunning] = useState(false);
	const [processId, setProcessId] = useState<string | null>(null);
	const [bShowTransform, setBShowTransform] = useState(false);
	const [transformOutput, setTransformOutput] = useState("export default (output) => output.toUpperCase();");
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

	return (
		<div className="runner">
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
						onRemove(id);
					}}
					className="btn secondary"
				>
					Remove
				</button>
			</div>

			<div className="runner-output">
				<pre className="output">{output || "Output will appear here..."}</pre>
				<div className="my-custom-resize-handle"></div>
			</div>
			<button onClick={() => setBShowTransform((prev) => !prev)} className="btn secondary">
				{bShowTransform ? "Hide Transform" : "Show Transform"}
			</button>
			<div className="transform-zone" style={{ height: bShowTransform ? "auto" : 0 }}>
				<textarea
					value={transformOutput}
					className="input"
					placeholder={`Enter transformation output... example:
export default (output) => output.toUpperCase();`}
					onChange={(ev) => setTransformOutput(ev.currentTarget.value)}
					onKeyDown={(ev) => void autosize(ev.currentTarget)}
				/>
				<button
					onClick={() => setApplyTransform(!bApplyingTransform)}
					className={"btn " + (bApplyingTransform ? "danger" : "")}
					disabled={!transformOutput.trim()}
				>
					{bApplyingTransform ? "Applying..." : "Apply Transform"}
				</button>
			</div>
		</div>
	);
}
