export { countListeningPorts } from "./system.ts";
export {
  filterPorts,
  formatAddresses,
  formatOwner,
  formatPortsSummary,
  formatPortRow,
  groupPortsByProcess,
  invalidatePortsCache,
  parseListeningPorts,
  peekPorts,
  portsTableHeader,
  portsTableLines,
  probeListeningPorts,
  readPorts,
  requestPorts,
  subscribePortsUpdates,
  summarizePorts,
  type ListeningPort,
  type PortsProbeResult,
  type PortsRenderSnapshot,
  type PortsSummary,
} from "./ports.ts";
export { SEGMENTS, renderSegment } from "./registry.ts";
export { registerCustomSegments } from "./custom.ts";
