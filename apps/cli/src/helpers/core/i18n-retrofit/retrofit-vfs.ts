import { VirtualFileSystem } from "@better-t-stack/template-generator";

/**
 * The generation phase a write belongs to. The create path emits new files via
 * the template phase and patches existing files via the dependency phase; the
 * Add Path reuses both, so the phase tells the classifier whether a write was
 * meant to be a `create` (never overwrite) or a `config-edit`/`anchored-insert`
 * (in-place patch, already anchor-guarded by the processors).
 */
export type RetrofitPhase = "create" | "edit";

export interface RetrofitWrite {
  path: string;
  content: string;
  /** On-disk content before the retrofit started, or undefined when new. */
  previous: string | undefined;
  phases: Set<RetrofitPhase>;
}

/** Project-relative POSIX key without a leading slash (matches `toTree` paths). */
export function vfsKey(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.?\//, "");
}

/**
 * A `VirtualFileSystem` that records every write and read against the project's
 * current state so the retrofit can classify each change as a create, an
 * in-place edit, a skipped no-op, or an unsafe overwrite (manual step).
 *
 * Deletions of pre-existing files are blocked outright: the Add Path never
 * removes an existing file (design D9 safety rule).
 */
export class RetrofitVirtualFileSystem extends VirtualFileSystem {
  phase: RetrofitPhase = "create";

  private readonly baseline = new Map<string, string | undefined>();
  private readonly editReads = new Set<string>();
  private readonly recorded = new Map<string, RetrofitWrite>();
  private readonly blockedDeletions = new Set<string>();

  /** Seed the on-disk project state without recording it as a write. */
  seed(files: Iterable<readonly [string, string]>): void {
    for (const [filePath, content] of files) {
      const key = vfsKey(filePath);
      this.baseline.set(key, content);
      super.writeFile(filePath, content);
    }
  }

  override readFile(filePath: string): string | undefined {
    const content = super.readFile(filePath);
    // A root file read during the patch phase but left unchanged means the
    // create-path anchor was missing or ambiguous (design D9 `manual`).
    if (content !== undefined && this.phase === "edit") this.editReads.add(vfsKey(filePath));
    return content;
  }

  override writeFile(filePath: string, content: string, sourcePath?: string): void {
    const key = vfsKey(filePath);
    if (!this.baseline.has(key)) {
      // First sighting during the retrofit: capture the on-disk predecessor.
      this.baseline.set(key, super.readFile(filePath));
    }

    const existing = this.recorded.get(key);
    if (existing) {
      existing.content = content;
      existing.phases.add(this.phase);
    } else {
      this.recorded.set(key, {
        path: key,
        content,
        previous: this.baseline.get(key),
        phases: new Set([this.phase]),
      });
    }

    super.writeFile(filePath, content, sourcePath);
  }

  override deleteFile(filePath: string): boolean {
    const key = vfsKey(filePath);
    if (this.baseline.get(key) !== undefined) {
      // Never delete a pre-existing file.
      this.blockedDeletions.add(key);
      return true;
    }
    return super.deleteFile(filePath);
  }

  override deleteDirectory(dirPath: string): boolean {
    const prefix = `${vfsKey(dirPath)}/`;
    for (const key of this.baseline.keys()) {
      if (key.startsWith(prefix) && this.baseline.get(key) !== undefined) {
        this.blockedDeletions.add(key);
        return true;
      }
    }
    return super.deleteDirectory(dirPath);
  }

  getWrites(): RetrofitWrite[] {
    return [...this.recorded.values()];
  }

  wasReadDuringEdit(filePath: string): boolean {
    return this.editReads.has(vfsKey(filePath));
  }

  baselineOf(filePath: string): string | undefined {
    return this.baseline.get(vfsKey(filePath));
  }

  existsOnDisk(filePath: string): boolean {
    return this.baseline.get(vfsKey(filePath)) !== undefined;
  }

  getBlockedDeletions(): string[] {
    return [...this.blockedDeletions];
  }
}
