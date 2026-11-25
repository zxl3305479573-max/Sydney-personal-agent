import { createHash } from "node:crypto";
import { link, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PROJECT_FILE_MAX_BYTES } from "@rakazo/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureWindowsProjectRoot, executeWindowsProjectFile } from "./windows-project-files.js";

describe.skipIf(process.platform !== "win32")("Windows authorized project files", () => {
  let temp: string;
  let directory: string;
  let outside: string;
  let root: Awaited<ReturnType<typeof captureWindowsProjectRoot>>;
  let signal: AbortSignal;

  beforeEach(async () => {
    temp = await mkdtemp(path.join(tmpdir(), "sydney-project-files-"));
    directory = path.join(temp, "project");
    outside = path.join(temp, "outside");
    await mkdir(path.join(directory, "notes"), { recursive: true });
    await mkdir(outside);
    await writeFile(path.join(outside, "private.md"), "outside");
    root = await captureWindowsProjectRoot(directory);
    signal = new AbortController().signal;
  });

  afterEach(async () => {
    await rm(temp, { recursive: true, force: true, maxRetries: 3 });
  });

  it("reads UTF-8 content and creates a new Markdown file without overwriting it", async () => {
    await writeFile(path.join(directory, "notes", "input.txt"), "样本");
    const sampleHash = createHash("sha256").update("样本", "utf8").digest("hex");
    await expect(
      executeWindowsProjectFile(root, { operation: "read", path: "notes/input.txt" }, signal),
    ).resolves.toEqual({ operation: "read", text: "样本", sha256: sampleHash });
    const create = { operation: "create", path: "notes/output.md", text: "结果" } as const;
    await expect(executeWindowsProjectFile(root, create, signal)).resolves.toEqual({
      operation: "create",
      bytes: 6,
    });
    await expect(
      executeWindowsProjectFile(root, { ...create, text: "replacement" }, signal),
    ).rejects.toThrow("Output already exists");
    expect(await readFile(path.join(directory, "notes", "output.md"), "utf8")).toBe("结果");
  });

  it("lists names from the authorized folder and skips reparse points", async () => {
    await writeFile(path.join(directory, "notes", "input.txt"), "样本");
    await symlink(outside, path.join(directory, "outside-link"), "junction");
    await expect(
      executeWindowsProjectFile(root, { operation: "list", path: "" }, signal),
    ).resolves.toEqual({
      operation: "list",
      entries: [{ path: "notes", kind: "directory" }],
      truncated: false,
    });
    await expect(
      executeWindowsProjectFile(root, { operation: "list", path: "notes" }, signal),
    ).resolves.toEqual({
      operation: "list",
      entries: [{ path: "notes/input.txt", kind: "file" }],
      truncated: false,
    });
  });

  it("searches UTF-8 files in the authorized folder and skips junctions, binary and oversized files", async () => {
    await writeFile(
      path.join(directory, "notes", "input.txt"),
      "First line\nFind Sydney target here\nThird",
      "utf8",
    );
    await writeFile(path.join(directory, "notes", "binary.bin"), Buffer.from([0xff, 0xfe, 0x00]));
    await writeFile(path.join(directory, "notes", "big.txt"), "Sydney".repeat(12_000), "utf8");
    await symlink(outside, path.join(directory, "outside-link"), "junction");
    await expect(
      executeWindowsProjectFile(
        root,
        { operation: "search", path: "", query: "sydney", caseSensitive: false },
        signal,
      ),
    ).resolves.toEqual({
      operation: "search",
      matches: [{ path: "notes/input.txt", line: 2, text: "Find Sydney target here" }],
      truncated: false,
    });
    await expect(
      executeWindowsProjectFile(
        root,
        { operation: "search", path: "notes", query: "sydney", caseSensitive: true },
        signal,
      ),
    ).resolves.toEqual({
      operation: "search",
      matches: [],
      truncated: false,
    });
  });

  it("updates only the version that was read and leaves a newer file untouched", async () => {
    const file = path.join(directory, "notes", "input.txt");
    await writeFile(file, "original", "utf8");
    const expectedSha256 = createHash("sha256").update("original").digest("hex");
    const update = {
      operation: "update",
      path: "notes/input.txt",
      expectedSha256,
      text: "updated",
    } as const;
    await expect(executeWindowsProjectFile(root, update, signal)).resolves.toEqual({
      operation: "update",
      bytes: 7,
      sha256: createHash("sha256").update("updated").digest("hex"),
    });
    expect(await readFile(file, "utf8")).toBe("updated");
    await writeFile(file, "external edit", "utf8");
    await expect(executeWindowsProjectFile(root, update, signal)).resolves.toEqual({
      operation: "conflict",
      sha256: createHash("sha256").update("external edit").digest("hex"),
    });
    expect(await readFile(file, "utf8")).toBe("external edit");
  });

  it("rejects directory junctions and multiply linked files", async () => {
    await symlink(outside, path.join(directory, "junction"), "junction");
    await link(path.join(outside, "private.md"), path.join(directory, "alias.md"));
    await expect(
      executeWindowsProjectFile(root, { operation: "read", path: "junction/private.md" }, signal),
    ).rejects.toThrow();
    await expect(
      executeWindowsProjectFile(root, { operation: "read", path: "alias.md" }, signal),
    ).rejects.toThrow();
    await expect(
      executeWindowsProjectFile(
        root,
        { operation: "create", path: "junction/output.md", text: "no" },
        signal,
      ),
    ).rejects.toThrow();
    await expect(readFile(path.join(outside, "output.md"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects a replacement directory after it was authorized", async () => {
    await rename(directory, path.join(temp, "former"));
    await mkdir(directory);
    await expect(
      executeWindowsProjectFile(
        root,
        { operation: "create", path: "output.md", text: "no" },
        signal,
      ),
    ).rejects.toThrow("authorized project folder changed");
    await expect(readFile(path.join(directory, "output.md"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects oversized, invalid UTF-8 and pre-cancelled work", async () => {
    await writeFile(path.join(directory, "big.txt"), Buffer.alloc(PROJECT_FILE_MAX_BYTES + 1));
    await writeFile(path.join(directory, "binary"), Buffer.from([0xff]));
    for (const file of ["big.txt", "binary"]) {
      await expect(
        executeWindowsProjectFile(root, { operation: "read", path: file }, signal),
      ).rejects.toThrow();
    }
    const controller = new AbortController();
    controller.abort(new Error("Cancelled by test"));
    await expect(
      executeWindowsProjectFile(
        root,
        { operation: "create", path: "cancelled.md", text: "no" },
        controller.signal,
      ),
    ).rejects.toThrow("Cancelled by test");
    await expect(readFile(path.join(directory, "cancelled.md"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.each([
    "../outside/private.md",
    "/outside/private.md",
    "notes\\input.txt",
    "a.md:stream",
    "NUL.txt",
  ])("rejects the invalid Windows path %s", async (relative) => {
    await expect(async () =>
      executeWindowsProjectFile(root, { operation: "read", path: relative }, signal),
    ).rejects.toThrow();
  });
});
