import { appendFileSync } from "node:fs";

export interface ChangedPackages {
  runtime: boolean;
  web_player: boolean;
}

const ZERO_SHA = "0000000000000000000000000000000000000000";
const ROOT_TRIGGER_FILES = new Set(["package.json", "bun.lock", "tsconfig.base.json"]);

export function detectChangedPackages(changedFiles: string[]): ChangedPackages {
  let runtime = false;
  let web_player = false;

  for (const file of changedFiles) {
    const normalized = file.trim();
    if (!normalized) {
      continue;
    }
    if (normalized.startsWith("runtime/") || ROOT_TRIGGER_FILES.has(normalized)) {
      runtime = true;
      web_player = true;
      break;
    }
    if (normalized.startsWith("web-player/")) {
      web_player = true;
    }
  }

  return { runtime, web_player };
}

function getGitChangedFiles(baseRef: string, headRef: string): string[] | null {
  if (!baseRef || baseRef === ZERO_SHA) {
    return null;
  }
  const proc = Bun.spawnSync(["git", "diff", "--name-only", `${baseRef}..${headRef}`], {
    stdout: "pipe",
    stderr: "pipe"
  });
  if (proc.exitCode !== 0) {
    return null;
  }
  const stdout = new TextDecoder().decode(proc.stdout);
  return stdout.split("\n").filter((line) => line.length > 0);
}

if (import.meta.main) {
  const forceAll = process.env.FORCE_ALL === "true";
  const baseRef = process.env.BASE_REF || "HEAD~1";
  const headRef = process.env.HEAD_REF || "HEAD";

  let result: ChangedPackages;
  if (forceAll) {
    result = { runtime: true, web_player: true };
  } else {
    const files = getGitChangedFiles(baseRef, headRef);
    result = files === null ? { runtime: true, web_player: true } : detectChangedPackages(files);
  }

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `runtime=${result.runtime}\nweb_player=${result.web_player}\n`
    );
  }

  console.log(JSON.stringify(result));
}
