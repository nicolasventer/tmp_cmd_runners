export type Runner = {
	command: string;
	transform: string;
	applyTransform: boolean;
	layout: {
		x?: number;
		y?: number;
		w: number;
		h: number;
	};
};

export type AppState = {
	idToRunner: Record<string, Runner>;
};
