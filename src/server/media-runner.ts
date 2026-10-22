/**
 * Media worker.
 *
 * The editor agent can ask the server to run a shell command to build or probe
 * media (ffmpeg, ffprobe, ImageMagick, python3). Commands run inside a scratch
 * directory, with a wall-clock limit, and anything they leave there is served
 * back through `/api/renders/<file>` so it can be dropped on the timeline.
 *
 * This is a deliberate capability of the product: the agent is expected to
 * synthesise test footage and audio. The guardrails below keep it contained to
 * the scratch directory and refuse obviously destructive commands.
 */
import { spawn } from "node:child_process";
import { mkdir, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

export const RENDER_ROOT = join(tmpdir(), "zyraxon-renders");

const BLOCKED = [
  /\brm\s+-rf\s+\//,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bsudo\b/,
  /:\s*\(\)\s*\{/,
  /\bcurl\b[^\n]*\|\s*(ba)?sh/,
  /\bwget\b[^\n]*\|\s*(ba)?sh/,
  /\/etc\/passwd/,
  /\bchmod\s+777\s+\//,
];

export type RunResult = {
  ok: boolean;
  log: string;
  exitCode: number;
  /** files created or modified, newest first */
  files: Array<{ name: string; size: number; url: string }>;
  url?: string;
};

export function screenScript(script: string): string | null {
  for (const pattern of BLOCKED) {
    if (pattern.test(script)) return `command refused: matches ${pattern}`;
  }
  return null;
}

async function listFiles(dir: string): Promise<Array<{ name: string; size: number; url: string }>> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: Array<{ name: string; size: number; url: string; mtime: number }> = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const info = await stat(join(dir, entry.name));
    files.push({
      name: entry.name,
      size: info.size,
      mtime: info.mtimeMs,
      url: `/api/renders/${encodeURIComponent(entry.name)}`,
    });
  }
  files.sort((a, b) => b.mtime - a.mtime);
  return files.map(({ name, size, url }) => ({ name, size, url }));
}

/** Run a shell script in the scratch directory and report what it produced. */
export async function runMediaScript(script: string, output?: string, timeoutMs = 120_000): Promise<RunResult> {
  const refused = screenScript(script);
  if (refused) return { ok: false, log: refused, exitCode: 126, files: [] };

  await mkdir(RENDER_ROOT, { recursive: true });
  const { stdout, stderr, exitCode } = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((done) => {
    const child = spawn("bash", ["-lc", script], {
      cwd: RENDER_ROOT,
      env: { ...process.env, PATH: process.env["PATH"] ?? "/usr/local/bin:/usr/bin:/bin" },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString();
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ stdout: out, stderr: err, exitCode: code ?? 1 });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      done({ stdout: out, stderr: `${err}${error.message}`, exitCode: 127 });
    });
  });

  const log = `${stdout}\n${stderr}`.trim().slice(-8000);
  const files = await listFiles(RENDER_ROOT);
  const result: RunResult = { ok: exitCode === 0, log, exitCode, files };
  if (output) {
    const wanted = files.find((f) => f.name === output);
    if (wanted) result.url = wanted.url;
    else if (exitCode !== 0) result.ok = false;
  }
  if (!result.url && files[0]) result.url = files[0].url;
  return result;
}

/** Resolve a filename inside the scratch directory, refusing path escapes. */
export function resolveRenderFile(name: string): string | null {
  const target = resolve(join(RENDER_ROOT, name));
  if (!target.startsWith(resolve(RENDER_ROOT) + sep)) return null;
  return target;
}
