import type { SelectItem } from "@earendil-works/pi-tui";

export interface PowerlineMenuNode {
  id: string;
  label: string;
  description?: string;
  children?: PowerlineMenuNode[];
}

const MAX_TOP_LEVEL = 3;

export function buildPowerlineMenuItems(): PowerlineMenuNode[] {
  return [
    { id: "navigate", label: "Navigate segments", description: "Jump to a live segment" },
    { id: "configure", label: "Configure", description: "Preset, TPS, ports, labels" },
    {
      id: "status",
      label: "Status",
      description: "Powerline status and diagnostics",
      children: [
        { id: "ports", label: "Open ports", description: "Full listening list" },
        { id: "tps", label: "TPS detail", description: "Live 1s window or override" },
        { id: "toggle", label: "Toggle powerline", description: "Use /powerline to enable or disable" },
        { id: "cpu", label: "CPU usage", description: "Current process CPU usage" },
        { id: "memory", label: "Memory usage", description: "Current process memory" },
        { id: "network", label: "Network status", description: "Network interface status" },
        { id: "uptime", label: "System uptime", description: "Host uptime" },
        { id: "version", label: "Version info", description: "Runtime and application versions" },
        { id: "logs", label: "Recent logs", description: "Show recent status messages" },
        { id: "diagnostics", label: "Diagnostics", description: "Run powerline diagnostics" },
      ],
    },
  ];
}

export function assertPowerlineMenuBounds(nodes: PowerlineMenuNode[] = buildPowerlineMenuItems()): PowerlineMenuNode[] {
  if (nodes.length > MAX_TOP_LEVEL) throw new Error(`Powerline menu allows at most ${MAX_TOP_LEVEL} top-level items`);
  return nodes;
}

export function findPowerlineMenuNode(id: string, nodes: PowerlineMenuNode[] = buildPowerlineMenuItems()): PowerlineMenuNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const nested = findPowerlineMenuNode(id, node.children);
      if (nested) return nested;
    }
  }
  return null;
}

export function powerlineMenuToSelectItems(nodes: PowerlineMenuNode[]): SelectItem[] {
  return nodes.map((node) => ({ value: node.id, label: node.label, description: node.description }));
}
