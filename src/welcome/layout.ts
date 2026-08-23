import { visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";

export function fitToWidth(str: string, width: number): string {
  const visLen = visibleWidth(str);
  if (visLen > width) return truncateToWidth(str, width, "…");
  return str + " ".repeat(width - visLen);
}

export function centerText(text: string, width: number): string {
  const visLen = visibleWidth(text);
  if (visLen > width) return truncateToWidth(text, width, "…");
  if (visLen === width) return text;
  const leftPad = Math.floor((width - visLen) / 2);
  const rightPad = width - visLen - leftPad;
  return " ".repeat(leftPad) + text + " ".repeat(rightPad);
}

export function getBoxLayout(termWidth: number) {
  const minLayoutWidth = 44;
  
  if (termWidth < minLayoutWidth) {
    return null;
  }
  
  const minWidth = 76;
  const maxWidth = 96;
  const boxWidth = Math.min(
    termWidth,
    Math.max(minWidth, Math.min(termWidth - 2, maxWidth))
  );
  
  const leftCol = 26;
  const rightCol = Math.max(1, boxWidth - leftCol - 3);
  
  return { boxWidth, leftCol, rightCol };
}
