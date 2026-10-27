/** a tooltip: the explanation goes in data-tip (the TooltipLayer shows it) and aria-label */
export const tip = (text: string) => ({ 'data-tip': text, 'aria-label': text });
