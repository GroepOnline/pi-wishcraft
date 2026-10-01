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
  requestPorts,
  summarizePorts,
  type ListeningPort,
  type PortsProbeResult,
  type PortsSummary,
} from "./ports.ts";
export { SEGMENTS, renderSegment } from "./registry.ts";
export { registerCustomSegments } from "./custom.ts";
