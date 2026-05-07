// bun index.html
// bun build --outdir ./out index.html
// bun build --compile --target=browser ./index.html --outdir=dist

import type { GridStackNode } from "gridstack";
import { GridStack } from "gridstack";
import "gridstack/dist/gridstack.min.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AppState } from "./AppState";
import { CommandRunner } from "./CommandRunner";
import "./styles.css";

const NEW_STATE_VALUE = "__new__";

const normalizeState = (nextState: AppState): AppState => ({
	idToRunner: Object.fromEntries(
		Object.entries(nextState.idToRunner).map(([id, runner]) => [
			id,
			{
				...runner,
				applyTransform: runner.applyTransform ?? false,
			},
		]),
	),
});

export default function App() {
	const [state, setState] = useState<AppState>({ idToRunner: {} });
	const [stateFiles, setStateFiles] = useState<string[]>([]);
	const [selectedStateFile, setSelectedStateFile] = useState(NEW_STATE_VALUE);
	const [hasChanged, setHasChanged] = useState(false);
	const gridEl = useRef<HTMLDivElement>(null);
	const grid = useRef<GridStack | null>(null);
	const runnerIds = Object.keys(state.idToRunner).join(",");

	const refreshStateFiles = useCallback(async () => {
		const response = await fetch("http://localhost:8000/states");
		if (!response.ok) {
			throw new Error("Failed to fetch state files");
		}

		const data = (await response.json()) as { files: string[] };
		setStateFiles(data.files);
		setSelectedStateFile((prev) => (prev === NEW_STATE_VALUE || data.files.includes(prev) ? prev : NEW_STATE_VALUE));
		return data.files;
	}, []);

	useEffect(() => {
		refreshStateFiles().catch((error: unknown) => {
			const message = error instanceof Error ? error.message : "Unknown error";
			window.alert(`Failed to refresh state files: ${message}`);
		});
	}, [refreshStateFiles]);

	useEffect(() => {
		if (!gridEl.current) return;

		grid.current = GridStack.init({
			alwaysShowResizeHandle: true,
			cellHeight: 80,
			resizable: {
				handles: "se",
				element: ".my-custom-resize-handle",
			},
		});

		const syncLayout = (_event: Event, items: GridStackNode[]) => {
			setHasChanged(true);
			setState((prev) => {
				const next = { ...prev, idToRunner: { ...prev.idToRunner } };
				let changed = false;

				for (const item of items) {
					if (!item.id) continue;
					const id = String(item.id);
					const runner = prev.idToRunner[id];
					if (!runner) continue;

					const layout = {
						x: item.x,
						y: item.y,
						w: item.w ?? 6,
						h: item.h ?? 3,
					};

					const current = runner.layout;
					if (current?.x === layout.x && current?.y === layout.y && current?.w === layout.w && current?.h === layout.h) {
						continue;
					}

					next.idToRunner[id] = { ...runner, layout };
					changed = true;
				}

				return changed ? next : prev;
			});
		};

		grid.current.on("change", syncLayout);

		return () => {
			grid.current?.destroy(false);
			grid.current = null;
		};
	}, []);

	const removeRunner = useCallback((id: string) => {
		setHasChanged(true);
		setState((prev) => {
			const { [id]: _removed, ...rest } = prev.idToRunner;
			return { idToRunner: rest };
		});
	}, []);

	const addRunner = useCallback(() => {
		setHasChanged(true);
		const id = Date.now().toString();
		setState((prev) => ({
			idToRunner: {
				...prev.idToRunner,
				[id]: {
					command: "",
					transform: "",
					applyTransform: false,
					layout: { w: 6, h: 3 },
				},
			},
		}));
	}, []);

	const updateRunner = useCallback((id: string, updates: Partial<AppState["idToRunner"][string]>) => {
		setHasChanged(true);
		setState((prev) => {
			const runner = prev.idToRunner[id];
			if (!runner) return prev;

			return {
				idToRunner: {
					...prev.idToRunner,
					[id]: { ...runner, ...updates },
				},
			};
		});
	}, []);

	const loadSelectedState = useCallback(async () => {
		if (selectedStateFile === NEW_STATE_VALUE) return;

		const response = await fetch(`http://localhost:8000/state?filename=${encodeURIComponent(selectedStateFile)}`);
		if (!response.ok) {
			throw new Error("Failed to load selected state");
		}

		const nextState = normalizeState((await response.json()) as AppState);
		setState(nextState);
		setHasChanged(false);
	}, [selectedStateFile]);

	const saveSelectedState = useCallback(async () => {
		const filename = selectedStateFile === NEW_STATE_VALUE ? "" : selectedStateFile;
		const response = await fetch(`http://localhost:8000/state?filename=${encodeURIComponent(filename)}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(state),
		});

		if (!response.ok) {
			throw new Error("Failed to save state");
		}

		const data = (await response.json()) as { filename: string };
		await refreshStateFiles();
		setSelectedStateFile(data.filename);
		setHasChanged(false);
	}, [refreshStateFiles, selectedStateFile, state]);

	const renameSelectedState = useCallback(async () => {
		if (selectedStateFile === NEW_STATE_VALUE) return;

		const newFilename = window.prompt("Rename state file", selectedStateFile);
		if (!newFilename || newFilename === selectedStateFile) return;

		const response = await fetch("http://localhost:8000/state/rename", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				old_filename: selectedStateFile,
				new_filename: newFilename,
			}),
		});

		if (!response.ok) {
			throw new Error("Failed to rename state");
		}

		const data = (await response.json()) as { new_filename: string };
		await refreshStateFiles();
		setSelectedStateFile(data.new_filename);
		setHasChanged(false);
	}, [refreshStateFiles, selectedStateFile]);

	useEffect(() => {
		if (!grid.current) return;

		grid.current.batchUpdate();
		grid.current.removeAll(false);

		Object.entries(state.idToRunner).forEach(([id, runner]) =>
			grid.current!.makeWidget(
				`#runner-${id}`,
				runner.layout.x !== undefined || runner.layout.y !== undefined
					? {
							x: runner.layout.x,
							y: runner.layout.y,
							w: runner.layout.w,
							h: runner.layout.h,
							id,
						}
					: { autoPosition: true, w: runner.layout.w, h: runner.layout.h, id },
			),
		);
		grid.current.batchUpdate(false);
	}, [runnerIds]);

	return (
		<div className="page">
			<div className="header">
				<h3>Command Runners</h3>
				<div className="header-controls">
					<button
						onClick={() => {
							refreshStateFiles().catch((error: unknown) => {
								const message = error instanceof Error ? error.message : "Unknown error";
								window.alert(`Failed to refresh state files: ${message}`);
							});
						}}
						className="btn secondary"
					>
						Refresh
					</button>
					<div />
					<select className="state-select" value={selectedStateFile} onChange={(e) => setSelectedStateFile(e.target.value)}>
						<option value={NEW_STATE_VALUE}>new</option>
						{stateFiles.map((filename) => (
							<option key={filename} value={filename}>
								{filename}
							</option>
						))}
					</select>
					<button
						onClick={() => {
							loadSelectedState().catch((error: unknown) => {
								const message = error instanceof Error ? error.message : "Unknown error";
								window.alert(`Failed to load state: ${message}`);
							});
						}}
						className="btn secondary"
						disabled={selectedStateFile === NEW_STATE_VALUE}
					>
						Load
					</button>
					<button
						onClick={() => {
							saveSelectedState().catch((error: unknown) => {
								const message = error instanceof Error ? error.message : "Unknown error";
								window.alert(`Failed to save state: ${message}`);
							});
						}}
						className="btn success"
						disabled={!hasChanged}
					>
						Save
					</button>
					<button
						onClick={() => {
							renameSelectedState().catch((error: unknown) => {
								const message = error instanceof Error ? error.message : "Unknown error";
								window.alert(`Failed to rename state: ${message}`);
							});
						}}
						className="btn secondary"
						disabled={selectedStateFile === NEW_STATE_VALUE}
					>
						Rename
					</button>
					<div />
					<div />
					<button onClick={addRunner} className="btn">
						Add Runner
					</button>
				</div>
			</div>
			<div className="grid-stack" ref={gridEl}>
				{Object.entries(state.idToRunner).map(([id, runner]) => (
					<div key={id} id={`runner-${id}`} className="grid-stack-item">
						<CommandRunner
							id={id}
							command={runner.command}
							transform={runner.transform}
							applyTransform={runner.applyTransform}
							updateRunner={updateRunner}
							onRemove={removeRunner}
						/>
					</div>
				))}
			</div>
		</div>
	);
}

createRoot(document.body).render(<App />);
