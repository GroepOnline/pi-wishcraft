/** DeepWiki MCP client (U9). Minimal JSON-RPC over streamable HTTP — no MCP
 *  SDK dependency. One `initialize` handshake, then `tools/call`.
 *  ponytail: revisit when DeepWiki adds a new capability we actually use. */

const PROTOCOL_VERSION = "2024-11-05";

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

async function rpc<T>(
  endpoint: string,
  method: string,
  params: unknown,
  fetchImpl: typeof fetch,
  idRef: { value: number },
): Promise<T> {
  const id = idRef.value;
  idRef.value += 1;
  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  if (!res.ok) {
    throw new Error(`DeepWiki HTTP ${res.status}`);
  }
  const json = (await res.json()) as JsonRpcResponse<T>;
  if (json.error) {
    throw new Error(`DeepWiki RPC error: ${json.error.message}`);
  }
  if (json.result === undefined) {
    throw new Error("DeepWiki response missing result");
  }
  return json.result;
}

export async function callTool<T = unknown>(
  tool: string,
  args: unknown,
  endpoint: string,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const idRef = { value: 0 };
  await rpc(endpoint, "initialize", { protocolVersion: PROTOCOL_VERSION, capabilities: {} }, fetchImpl, idRef);
  return rpc<T>(endpoint, "tools/call", { name: tool, arguments: args }, fetchImpl, idRef);
}
