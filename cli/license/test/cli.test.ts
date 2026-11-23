import { describe, expect, it } from "vitest";
import { run } from "../src/index";

describe("hashly-license", () => {
  it("issues and verifies a development Pro key", () => {
    const lines: string[] = [];
    const code = run(["issue", "--dev", "--plan", "pro", "--subject", "miner@example.com", "--days", "30"], {
      log: (line) => lines.push(line),
      err: () => undefined,
    });
    expect(code).toBe(0);
    const verify = run(["verify", lines[0] ?? ""], { log: (line) => lines.push(line), err: () => undefined });
    expect(verify).toBe(0);
    expect(lines.at(-1)).toContain("pro miner@example.com");
  });

  it("refuses to issue with the development key unless --dev is set", () => {
    const errors: string[] = [];
    const code = run(["issue", "--plan", "pro", "--subject", "a@b.c", "--days", "10"], {
      log: () => undefined,
      err: (line) => errors.push(line),
    });
    expect(code).toBe(1);
    expect(errors.join(" ")).toMatch(/Refusing/);
  });
});
