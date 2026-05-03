import autosize from "autosize";
import { useState } from "react";

export default function CommandRunner({ id, onRemove }: { id: string; onRemove: (id: string) => void }) {
	const [cmd, setCmd] = useState("");
	const [output, setOutput] = useState("");
	const [running, setRunning] = useState(false);
	const [processId, setProcessId] = useState<string | null>(null);

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
				setOutput((prev) => prev + chunk);
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

			<pre className="output">{output || "Output will appear here..."}</pre>
		</div>
	);
}
