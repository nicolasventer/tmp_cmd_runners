// bun index.html
// bun build --outdir ./out index.html
// bun build --compile --target=browser ./index.html --outdir=dist

import { GridStack } from "gridstack";
import "gridstack/dist/gridstack.min.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import CommandRunner from "./CommandRunner";
import "./styles.css";

type Runner = {
	id: string;
};

export default function App() {
	const [runners, setRunners] = useState<Runner[]>([]);
	const gridEl = useRef<HTMLDivElement>(null);
	const grid = useRef<GridStack | null>(null);

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
	}, []);

	const removeRunner = useCallback((id: string) => {
		setRunners((prev) => prev.filter((r) => r.id !== id));
	}, []);
	const addRunner = useCallback(() => {
		if (!grid.current) return;
		const id = Date.now().toString();
		setRunners((prev) => [...prev, { id: id }]);
	}, []);

	useEffect(() => {
		if (!grid.current) return;
		const positions = Object.fromEntries(grid.current.getGridItems().map(({ gridstackNode: item }) => [item?.id, item]));
		grid.current.batchUpdate();
		grid.current.removeAll(false);
		runners.forEach(({ id }) =>
			grid.current!.makeWidget(
				`#runner-${id}`,
				positions[id]
					? { x: positions[id].x, y: positions[id].y, w: positions[id].w, h: positions[id].h, id: positions[id].id }
					: { autoPosition: true, w: 6, h: 3, id: id },
			),
		);
		grid.current.batchUpdate(false);
	}, [runners]);

	return (
		<div className="page">
			<div className="header">
				<h3>Command Runners</h3>
				<button onClick={addRunner} className="btn">
					Add Runner
				</button>
			</div>
			<div className="grid-stack" ref={gridEl}>
				{runners.map((runner) => (
					<div key={runner.id} id={`runner-${runner.id}`} className="grid-stack-item">
						<CommandRunner id={runner.id} onRemove={removeRunner} />
					</div>
				))}
			</div>
		</div>
	);
}

createRoot(document.body).render(<App />);
