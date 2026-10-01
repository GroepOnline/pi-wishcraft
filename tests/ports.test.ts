import assert from "node:assert/strict";
import { test } from "node:test";

import {
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
  summarizePorts,
} from "../src/segments/ports.ts";
import {
  parseOpenPortProcesses,
  sanitizeSshHost,
  sshCommand,
} from "../src/segments/system.ts";

const SS_OUTPUT = `Netid  State   Recv-Q Send-Q  Local Address:Port   Peer Address:Process
tcp    LISTEN  0      4096    127.0.0.1:631       0.0.0.0:*    users:(("cupsd",pid=1234,fd=12))
tcp    LISTEN  0      4096    0.0.0.0:22          0.0.0.0:*    users:(("sshd",pid=700,fd=3))
tcp    LISTEN  0      128     [::1]:631           [::]:*       users:(("cupsd",pid=1234,fd=11))
tcp    LISTEN  0      128     0.0.0.0:8080        0.0.0.0:*
udp    UNCONN  0      0       0.0.0.0:5353        0.0.0.0:*    users:(("mdnsd",pid=99,fd=8))
`;

test("ss output parses into structured, deduped ports", () => {
  const rows = parseListeningPorts(SS_OUTPUT);
  assert.equal(rows.length, 4, "dual-stack binds collapse to one port");

  const byKey = new Map(rows.map((row) => [`${row.proto}:${row.port}`, row]));

  const ssh = byKey.get("tcp:22");
  assert.ok(ssh);
  assert.deepEqual(ssh!.addresses, ["0.0.0.0"]);
  assert.equal(ssh!.state, "LISTEN");
  assert.equal(ssh!.process, "sshd");
  assert.equal(ssh!.pid, 700);

  const cupsd = byKey.get("tcp:631");
  assert.ok(cupsd);
  assert.deepEqual(cupsd!.addresses, ["127.0.0.1", "::1"]);
  assert.equal(cupsd!.process, "cupsd");
  assert.equal(cupsd!.pid, 1234);

  // No process column → owner is unknown, not a crash or a fake row.
  const bare = byKey.get("tcp:8080");
  assert.ok(bare);
  assert.equal(bare!.process, null);
  assert.equal(formatOwner(bare!), "(unknown)");

  const mdns = byKey.get("udp:5353");
  assert.ok(mdns);
  assert.equal(mdns!.proto, "udp");
  assert.equal(mdns!.state, "UNCONN");
  assert.equal(mdns!.process, "mdnsd");
});

test("rows are sorted by port then protocol", () => {
  const rows = parseListeningPorts(SS_OUTPUT);
  assert.deepEqual(
    rows.map((row) => `${row.proto}:${row.port}`),
    ["tcp:22", "tcp:631", "udp:5353", "tcp:8080"],
  );
});

test("headered and headerless output parse identically", () => {
  const headerless = SS_OUTPUT.split("\n").slice(1).join("\n");
  assert.deepEqual(parseListeningPorts(headerless), parseListeningPorts(SS_OUTPUT));
});

test("older iproute2 output without pid= still yields an owner", () => {
  const rows = parseListeningPorts(
    'tcp LISTEN 0 4096 127.0.0.1:5432 0.0.0.0:* users:(("postgres",fd=7))\n',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.process, "postgres");
  assert.equal(rows[0]!.pid, null);
  assert.equal(formatOwner(rows[0]!), "postgres");
});

test("netstat output parses, including macOS dotted local addresses", () => {
  const linux = `Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 127.0.0.1:631          0.0.0.0:*               LISTEN      1234/cupsd
tcp        0      0 0.0.0.0:443            0.0.0.0:*               LISTEN      -
udp        0      0 0.0.0.0:68             0.0.0.0:*
`;
  const linuxRows = parseListeningPorts(linux);
  assert.deepEqual(
    linuxRows.map((row) => `${row.proto}:${row.port}`),
    ["udp:68", "tcp:443", "tcp:631"],
  );
  assert.equal(linuxRows.find((r) => r.port === 631)?.process, "cupsd");
  assert.equal(linuxRows.find((r) => r.port === 443)?.process, null);

  const macos = `Proto Recv-Q Send-Q Local Address           Foreign Address         State
tcp4        0      0 *.5900                 *.*                     LISTEN
tcp4        0      0 127.0.0.1.631          *.*                     LISTEN
udp4        0      0 *.5353                 *.*
`;
  const macRows = parseListeningPorts(macos);
  assert.deepEqual(
    macRows.map((row) => `${row.proto}:${row.port}`),
    ["tcp:631", "udp:5353", "tcp:5900"],
  );
  assert.deepEqual(
    macRows.find((r) => r.port === 631)?.addresses,
    ["127.0.0.1"],
  );
});

test("garbage input parses to nothing instead of throwing", () => {
  assert.deepEqual(parseListeningPorts(""), []);
  assert.deepEqual(parseListeningPorts("\n\n   \n"), []);
  assert.deepEqual(parseListeningPorts("random prose without ports"), []);
  assert.deepEqual(parseListeningPorts("Proto\n"), []);
});

test("summary separates exposed from loopback sockets", () => {
  const summary = summarizePorts(parseListeningPorts(SS_OUTPUT));
  assert.equal(summary.total, 4);
  assert.equal(summary.tcp, 3);
  assert.equal(summary.udp, 1);
  // 0.0.0.0:22, 0.0.0.0:8080 and 0.0.0.0:5353 are reachable; 631 is bound to
  // loopback on both stacks (brackets stripped, so `::1` is recognised).
  assert.equal(summary.exposed, 3);
  assert.equal(summary.loopback, 1);
});

test("addresses list the externally reachable bind first", () => {
  const rows = parseListeningPorts(SS_OUTPUT);
  const cupsd = rows.find((row) => row.port === 631)!;
  const wildcard = parseListeningPorts(
    'tcp LISTEN 0 1 0.0.0.0:9000 0.0.0.0:* users:(("a",pid=1,fd=1))\ntcp LISTEN 0 1 127.0.0.1:9000 0.0.0.0:* users:(("a",pid=1,fd=2))\n',
  ).find((row) => row.port === 9000)!;
  assert.equal(formatAddresses(["127.0.0.1", "::1"]), "127.0.0.1, ::1");
  assert.equal(formatAddresses(wildcard.addresses), "0.0.0.0, 127.0.0.1");
  assert.equal(formatAddresses([]), "*");
  assert.ok(cupsd.addresses.includes("::1"));
});

test("table lines carry a header, aligned rows and a truncation tail", () => {
  const rows = parseListeningPorts(SS_OUTPUT);
  const lines = portsTableLines(rows, 80, 2);
  assert.equal(lines[0], portsTableHeader());
  assert.equal(lines.length, 4, "header + 2 rows + tail");
  assert.match(lines[3]!, /… 2 more/);
  assert.match(lines[1]!, /^tcp\s+22\s/);

  for (const line of portsTableLines(rows, 24, 99)) {
    assert.ok(line.length <= 40, `unexpectedly long row: ${line}`);
  }

  assert.deepEqual(portsTableLines([], 80), []);
});

test("rows are truncated to the available width", () => {
  const rows = parseListeningPorts(
    'tcp LISTEN 0 1 0.0.0.0:1234 0.0.0.0:* users:(("a-very-long-process-name",pid=424242,fd=1))\n',
  );
  const row = formatPortRow(rows[0]!, 24);
  assert.ok(row.length <= 24, row);
  assert.ok(row.includes("…"), row);
});

test("filter matches port, protocol, address and owner", () => {
  const rows = parseListeningPorts(SS_OUTPUT);
  assert.equal(filterPorts(rows, "").length, 4);
  assert.equal(filterPorts(rows, "22").length, 1);
  assert.equal(filterPorts(rows, "cupsd").length, 1);
  assert.equal(filterPorts(rows, "udp").length, 1);
  assert.equal(filterPorts(rows, "127.0.0.1").length, 1);
  assert.equal(filterPorts(rows, "nothing-matches").length, 0);
});

test("ports group by owner with their ports attached", () => {
  const rows = parseListeningPorts(SS_OUTPUT);
  const groups = groupPortsByProcess(rows);
  assert.equal(groups.length, 4);
  const cupsd = groups.find((group) => group.process === "cupsd (1234)");
  assert.deepEqual(cupsd?.ports, ["tcp:631"]);
  assert.ok(groups.some((group) => group.process === "(unknown)"));
  // Biggest holder first when counts differ.
  const stacked = parseListeningPorts(
    [
      'tcp LISTEN 0 1 0.0.0.0:1 0.0.0.0:* users:("big",pid=1,fd=1))',
      'tcp LISTEN 0 1 0.0.0.0:2 0.0.0.0:* users:("big",pid=1,fd=2))',
      'tcp LISTEN 0 1 0.0.0.0:3 0.0.0.0:* users:("small",pid=2,fd=1))',
    ].join("\n"),
  );
  const ordered = groupPortsByProcess(stacked);
  assert.equal(ordered[0]?.process, "big (1)");
  assert.equal(ordered[0]?.ports.length, 2);
  assert.equal(ordered[1]?.process, "small (2)");
});

test("summary line names the count, exposure and probe target", () => {
  const summary = summarizePorts(parseListeningPorts(SS_OUTPUT));
  const local = formatPortsSummary(summary, null, false);
  assert.match(local, /3 tcp/);
  assert.match(local, /3 exposed/);
  assert.match(local, /local/);
  assert.doesNotMatch(local, /udp/, "udp is omitted unless opted in");

  const remote = formatPortsSummary(summary, "sofie", true);
  assert.match(remote, /1 udp/);
  assert.match(remote, /via sofie/);
});

test("fleet SSH helpers are unchanged and still exported from system", () => {
  assert.equal(sanitizeSshHost("sofie"), "sofie");
  assert.equal(sanitizeSshHost("user@10.0.0.4"), "user@10.0.0.4");
  assert.equal(sanitizeSshHost("bad host"), null);
  assert.equal(sanitizeSshHost("host; rm -rf /"), null);
  assert.equal(sanitizeSshHost(undefined), null);
  assert.equal(sshCommand(undefined, "ss -tln"), "ss -tln");
  assert.match(sshCommand("sofie", "ss -tln")!, /^ssh -o ConnectTimeout=3 /);
  assert.equal(sshCommand("bad host", "ss"), null);
});

test("the legacy detail projection is derived from the shared parser", () => {
  const legacy = parseOpenPortProcesses(SS_OUTPUT);
  assert.equal(legacy.length, 4);
  const ssh = legacy.find((entry) => entry.port === 22);
  assert.deepEqual(ssh, {
    port: 22,
    proto: "tcp",
    address: "0.0.0.0",
    process: "sshd (700)",
  });
  const bare = legacy.find((entry) => entry.port === 8080);
  assert.equal(bare?.process, null);
  assert.equal(bare?.address, "0.0.0.0");
});

test("an invalid fleet host fails fast without spawning anything", async () => {
  invalidatePortsCache();
  assert.equal(peekPorts({ host: "bad host" }), null);

  const result = await probeListeningPorts({ host: "bad host" });
  assert.equal(result.source, "failed");
  assert.equal(result.rows.length, 0);
  assert.match(result.error!, /invalid open-ports host/);

  // The failure is memoised too, so a render path can report it immediately.
  const peeked = peekPorts({ host: "bad host" });
  assert.equal(peeked, result);
});

test("cache keys separate protocol and host", async () => {
  invalidatePortsCache();
  await probeListeningPorts({ host: "also bad" });
  assert.equal(peekPorts({ host: "different host" }), null);
  assert.equal(peekPorts({ includeUdp: true, host: "also bad" }), null);
  assert.ok(peekPorts({ host: "also bad" }));
  invalidatePortsCache();
  assert.equal(peekPorts({ host: "also bad" }), null);
});
