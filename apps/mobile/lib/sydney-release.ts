type ReleaseLocale = "en" | "zh-CN" | "zh-TW";

export type SydneyRelease = {
  version: string;
  releasedOn: string;
  notes: Record<ReleaseLocale, string[]>;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function noteList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((note) => typeof note === "string" && note.trim().length > 0)
  );
}

export function readSydneyRelease(value: unknown): SydneyRelease | null {
  const fields = record(value);
  const version = fields?.version;
  const releasedOn = fields?.releasedOn;
  const notes = record(fields?.notes);
  if (
    typeof version !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(version) ||
    typeof releasedOn !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(releasedOn) ||
    !noteList(notes?.en) ||
    !noteList(notes["zh-CN"]) ||
    !noteList(notes["zh-TW"])
  ) {
    return null;
  }
  return {
    version,
    releasedOn,
    notes: { en: notes.en, "zh-CN": notes["zh-CN"], "zh-TW": notes["zh-TW"] },
  };
}

export function sydneyReleaseFromManifest(manifest: unknown): SydneyRelease | null {
  const expoClient = record(record(record(manifest)?.extra)?.expoClient);
  return readSydneyRelease(record(expoClient?.extra)?.sydneyMobileRelease);
}

export function sydneyReleaseNotes(release: SydneyRelease, locale: string): string {
  const key = locale === "zh-TW" ? "zh-TW" : locale === "zh-CN" ? "zh-CN" : "en";
  return release.notes[key].map((note) => `• ${note}`).join("\n");
}
