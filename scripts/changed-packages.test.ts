import { describe, expect, test } from "bun:test";
import { detectChangedPackages } from "./changed-packages.ts";

describe("detectChangedPackages", () => {
  test("marks only web_player when only web-player files change", () => {
    expect(detectChangedPackages(["web-player/src/loader.ts", "README.md"])).toEqual({
      runtime: false,
      web_player: true
    });
  });

  test("marks both runtime and web_player when runtime files change", () => {
    expect(detectChangedPackages(["runtime/src/index.ts"])).toEqual({
      runtime: true,
      web_player: true
    });
  });

  test("marks both when workspace root config or lockfile changes", () => {
    expect(detectChangedPackages(["bun.lock"])).toEqual({
      runtime: true,
      web_player: true
    });
  });

  test("marks neither when only docs or workflow files change", () => {
    expect(detectChangedPackages(["README.md", "LICENSE", ".github/workflows/ci-release.yml"])).toEqual({
      runtime: false,
      web_player: false
    });
  });
});
