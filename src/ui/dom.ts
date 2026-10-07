export function $<T extends HTMLElement = HTMLElement>(selector: string): T {
	const element = document.querySelector<T>(selector);
	if (!element) throw new Error(`missing element ${selector}`);
	return element;
}

export function show(element: HTMLElement, visible: boolean): void {
	element.hidden = !visible;
}
