// bun index.html
// bun build --outdir ./out index.html
// bun build --compile --target=browser ./index.html --outdir=dist

import { useState } from "react";
import { createRoot } from "react-dom/client";

/* -------------------- CommandRunner -------------------- */

function CommandRunner({ id, onRemove }: { id: string; onRemove: (id: string) => void }) {
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
			const response = await fetch(`http://localhost:8000/run?id=${pid}&cmd=${encodeURIComponent(cmd)}`);

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
			if (err instanceof Error) {
				setOutput("Error: " + err.message);
			} else {
				setOutput("Unknown error: " + JSON.stringify(err));
			}
		}

		setRunning(false);
		setProcessId(null);
	};

	const stopCommand = async () => {
		if (!processId) return;

		await fetch(`http://localhost:8000/stop?id=${processId}`);
		setOutput((prev) => prev + "\n[Stopped by user]\n");
		setRunning(false);
	};

	return (
		<div style={styles.runner}>
			<div style={styles.row}>
				<input
					value={cmd}
					onChange={(e) => setCmd(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && runCommand()}
					placeholder="Enter command"
					style={styles.input}
				/>

				<button onClick={runCommand} disabled={running} style={styles.button}>
					{running ? "Running..." : "Run"}
				</button>

				<button onClick={stopCommand} disabled={!running} style={{ ...styles.button, backgroundColor: "#dc2626" }}>
					Stop
				</button>

				<button onClick={() => onRemove(id)} style={{ ...styles.button, backgroundColor: "#555" }}>
					Remove
				</button>
			</div>

			<pre style={styles.output}>{output || "Output will appear here..."}</pre>
		</div>
	);
}

/* -------------------- App (manager) -------------------- */

export default function App() {
	const [runners, setRunners] = useState<string[]>([]);

	const addRunner = () => {
		setRunners((prev) => [...prev, crypto.randomUUID()]);
	};

	const removeRunner = (id: string) => {
		setRunners((prev) => prev.filter((r) => r !== id));
	};

	return (
		<div style={styles.page}>
			<div style={styles.container}>
				<h1 style={styles.title}>Command Runner Pool</h1>

				<button onClick={addRunner} style={styles.addButton}>
					+ Add Runner
				</button>

				{runners.length === 0 && <p style={{ opacity: 0.6 }}>No runners yet</p>}

				{runners.map((id) => (
					<CommandRunner key={id} id={id} onRemove={removeRunner} />
				))}
			</div>
		</div>
	);
}

/* -------------------- render -------------------- */

createRoot(document.body).render(<App />);

/* -------------------- styles -------------------- */

const styles: Record<string, React.CSSProperties> = {
	page: {
		backgroundColor: "#111",
		color: "#fff",
		minHeight: "100vh",
		padding: "20px",
		fontFamily: "Arial, sans-serif",
	},
	container: {
		maxWidth: "900px",
		margin: "0 auto",
	},
	title: {
		fontSize: "24px",
		marginBottom: "10px",
	},
	addButton: {
		padding: "10px 14px",
		marginBottom: "20px",
		backgroundColor: "#16a34a",
		color: "#fff",
		border: "none",
		borderRadius: "4px",
		cursor: "pointer",
	},
	runner: {
		marginBottom: "20px",
		padding: "10px",
		border: "1px solid #333",
		borderRadius: "6px",
		backgroundColor: "#1a1a1a",
	},
	row: {
		display: "flex",
		gap: "10px",
		marginBottom: "10px",
	},
	input: {
		flex: 1,
		padding: "10px",
		fontSize: "14px",
		backgroundColor: "#222",
		border: "1px solid #444",
		color: "#fff",
		borderRadius: "4px",
	},
	button: {
		padding: "10px 12px",
		fontSize: "14px",
		backgroundColor: "#2563eb",
		border: "none",
		color: "#fff",
		borderRadius: "4px",
		cursor: "pointer",
	},
	output: {
		backgroundColor: "#000",
		padding: "12px",
		borderRadius: "4px",
		height: "250px",
		overflowY: "auto",
		whiteSpace: "pre-wrap",
		border: "1px solid #333",
	},
};
