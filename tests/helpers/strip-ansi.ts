export function stripAnsi(value: string): string {
  return value
    // OSC payloads stop at the first terminator (BEL or ESC \) — excluding
    // ESC inside the payload keeps an ESC-terminated OSC (e.g. OSC 8
    // hyperlinks) from swallowing following sequences.
    .replace(/\x1B\][^\u0007\x1b]*(?:\u0007|\x1b\\)?/g, "")
    .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}
