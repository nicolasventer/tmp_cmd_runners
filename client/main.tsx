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

export default function App() {
	const [state, setState] = useState<AppState>({ idToRunner: {} });
	const gridEl = useRef<HTMLDivElement>(null);
	const grid = useRef<GridStack | null>(null);
	const runnerIds = Object.keys(state.idToRunner).join(",");

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
		setState((prev) => {
			const { [id]: _removed, ...rest } = prev.idToRunner;
			return { idToRunner: rest };
		});
	}, []);

	const addRunner = useCallback(() => {
		const id = Date.now().toString();
		setState((prev) => ({
			idToRunner: {
				...prev.idToRunner,
				[id]: {
					command: "",
					transform: "",
					layout: { w: 6, h: 3 },
				},
			},
		}));
	}, []);

	const updateRunner = useCallback((id: string, updates: Partial<AppState["idToRunner"][string]>) => {
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
				<button onClick={addRunner} className="btn">
					Add Runner
				</button>
			</div>
			<div className="grid-stack" ref={gridEl}>
				{Object.entries(state.idToRunner).map(([id, runner]) => (
					<div key={id} id={`runner-${id}`} className="grid-stack-item">
						<CommandRunner
							id={id}
							command={runner.command}
							transform={runner.transform}
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
