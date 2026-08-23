import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentPath } from "../paths/agent-dirs.ts";

export interface PatchHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface FilePatch {
  targetFile: string;
  hunks: PatchHunk[];
}

export interface PatchResult {
  success: boolean;
  targetFile: string;
  appliedHunks: number;
  totalHunks: number;
  backupPath?: string;
  error?: string;
}

const undoStack: { targetFile: string; backupPath: string; timestamp: number }[] = [];
const MAX_UNDO_STACK = 10;

/**
 * Parse a unified diff string into structured FilePatch objects.
 */
export function parseUnifiedDiff(diffText: string): FilePatch[] {
  const patches: FilePatch[] = [];
  const lines = diffText.split(/\r?\n/);
  let currentPatch: FilePatch | null = null;
  let currentHunk: PatchHunk | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("--- ")) {
      continue;
    }

    if (line.startsWith("+++ ")) {
      const rawPath = line.slice(4).trim();
      const targetFile = rawPath.replace(/^[ab]\//, "");
      currentPatch = { targetFile, hunks: [] };
      patches.push(currentPatch);
      continue;
    }

    const hunkHeaderMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkHeaderMatch && currentPatch) {
      currentHunk = {
        oldStart: parseInt(hunkHeaderMatch[1], 10),
        oldLines: parseInt(hunkHeaderMatch[2] ?? "1", 10),
        newStart: parseInt(hunkHeaderMatch[3], 10),
        newLines: parseInt(hunkHeaderMatch[4] ?? "1", 10),
        lines: [],
      };
      currentPatch.hunks.push(currentHunk);
      continue;
    }

    if (currentHunk && (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ") || line === "")) {
      currentHunk.lines.push(line);
    }
  }

  return patches;
}

/**
 * Apply a FilePatch to a file safely with an atomic backup.
 */
export function applyFilePatch(patch: FilePatch, baseDir: string = process.cwd()): PatchResult {
  const fullPath = join(baseDir, patch.targetFile);
  
  if (!existsSync(fullPath)) {
    return {
      success: false,
      targetFile: patch.targetFile,
      appliedHunks: 0,
      totalHunks: patch.hunks.length,
      error: `Target file not found: ${fullPath}`,
    };
  }

  // 1. Create backup
  const backupDir = getAgentPath("patch-backups");
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }
  const backupPath = join(backupDir, `${Date.now()}-${patch.targetFile.replace(/\//g, "_")}.bak`);
  copyFileSync(fullPath, backupPath);

  try {
    const originalContent = readFileSync(fullPath, "utf-8");
    let fileLines = originalContent.split(/\r?\n/);
    let appliedHunks = 0;

    for (const hunk of patch.hunks) {
      const targetLineIdx = hunk.oldStart - 1;
      const expectedOldLines = hunk.lines.filter((l) => !l.startsWith("+"));
      
      // Match context check
      let matches = true;
      for (let j = 0; j < expectedOldLines.length; j++) {
        const expected = expectedOldLines[j].slice(1);
        const actual = fileLines[targetLineIdx + j];
        if (actual !== undefined && actual !== expected) {
          matches = false;
          break;
        }
      }

      if (matches) {
        const newHunkLines: string[] = [];
        for (const line of hunk.lines) {
          if (!line.startsWith("-")) {
            newHunkLines.push(line.startsWith("+") ? line.slice(1) : line.slice(1));
          }
        }
        
        fileLines.splice(targetLineIdx, hunk.oldLines, ...newHunkLines);
        appliedHunks++;
      }
    }

    writeFileSync(fullPath, fileLines.join("\n"), "utf-8");

    // Track undo stack
    undoStack.push({ targetFile: fullPath, backupPath, timestamp: Date.now() });
    if (undoStack.length > MAX_UNDO_STACK) {
      const oldest = undoStack.shift();
      if (oldest && existsSync(oldest.backupPath)) {
        try { unlinkSync(oldest.backupPath); } catch {}
      }
    }

    return {
      success: appliedHunks > 0,
      targetFile: patch.targetFile,
      appliedHunks,
      totalHunks: patch.hunks.length,
      backupPath,
    };
  } catch (err) {
    // Revert from backup
    copyFileSync(backupPath, fullPath);
    return {
      success: false,
      targetFile: patch.targetFile,
      appliedHunks: 0,
      totalHunks: patch.hunks.length,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Revert the last applied patch.
 */
export function undoLastPatch(): { success: boolean; targetFile?: string; error?: string } {
  const last = undoStack.pop();
  if (!last || !existsSync(last.backupPath)) {
    return { success: false, error: "No undo backup available" };
  }

  try {
    copyFileSync(last.backupPath, last.targetFile);
    unlinkSync(last.backupPath);
    return { success: true, targetFile: last.targetFile };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
