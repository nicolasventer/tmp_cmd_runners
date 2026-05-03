// bun index.html
// bun build --outdir ./out index.html
// bun build --compile --target=browser ./index.html --outdir=dist

import { useState } from "react";
import { createRoot } from "react-dom/client";

export default function App() {
	const [cmd, setCmd] = useState("");
	const [output, setOutput] = useState("");
	const [running, setRunning] = useState(false);
	const [processId, setProcessId] = useState<string | null>(null);

	const runCommand = async () => {
		setOutput("");
		setRunning(true);

		const id = Date.now().toString();
		setProcessId(id);

		try {
			const response = await fetch(`http://localhost:8000/run?id=${id}&cmd=${encodeURIComponent(cmd)}`);

			if (!response.body) return;
			const reader = response.body.getReader();
			const decoder = new TextDecoder("utf-8");

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value, { stream: true });
				setOutput((prev) => prev + chunk);
			}

			// flush remaining bytes
			setOutput((prev) => prev + decoder.decode());
		} catch (err) {
			if (err instanceof Error) setOutput("Error: " + err.message);
			else setOutput("An unknown error occurred: " + JSON.stringify(err));
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
		<div style={styles.page}>
			<div style={styles.container}>
				<h1 style={styles.title}>Command Runner</h1>

				<div style={styles.row}>
					<input
						value={cmd}
						onChange={(e) => setCmd(e.target.value)}
						onKeyDown={(ev) => void (ev.key === "Enter" && runCommand())}
						placeholder="Enter command"
						style={styles.input}
					/>
					<button onClick={runCommand} disabled={running} style={styles.button}>
						{running ? "Running..." : "Run"}
					</button>
					<button onClick={stopCommand} disabled={!running} style={{ ...styles.button, backgroundColor: "#dc2626" }}>
						Stop
					</button>
				</div>

				<pre style={styles.output}>{output || "Output will appear here..."}</pre>
			</div>
		</div>
	);
}

createRoot(document.body).render(<App />);

const styles = {
	page: {
		backgroundColor: "#111",
		color: "#fff",
		minHeight: "100vh",
		padding: "20px",
		fontFamily: "Arial, sans-serif",
	},
	container: {
		maxWidth: "800px",
		margin: "0 auto",
	},
	title: {
		fontSize: "24px",
		marginBottom: "20px",
	},
	row: {
		display: "flex",
		gap: "10px",
		marginBottom: "20px",
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
		padding: "10px 16px",
		fontSize: "14px",
		backgroundColor: "#2563eb",
		border: "none",
		color: "#fff",
		borderRadius: "4px",
		cursor: "pointer",
		opacity: 1,
	},
	output: {
		backgroundColor: "#000",
		padding: "15px",
		borderRadius: "4px",
		height: "400px",
		overflowY: "auto",
		whiteSpace: "pre-wrap",
		border: "1px solid #333",
	},
};
