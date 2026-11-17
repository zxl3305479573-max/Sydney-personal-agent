import { BOT_AVATAR_VALUE_MAX_LENGTH, isBotAvatarValue, parseBotAvatarValue } from "@rakazo/contracts";
import {
  avatarIdentitySeed,
  contrastRatio,
  LOGO_BODY_PATH,
  logoAvatarPaint,
  logoAvatarTraits,
  organicAvatarPath,
  usesLogoAvatar,
} from "@rakazo/core";
import { mobileBotAvatarPresentation } from "./bot-avatar";

const MAX_PATH_LENGTH = 2200;

export function companionAvatar(input: {
  botId: string;
  color: string;
  avatarSet?: string | null;
}): string | null {
  const parsed = parseBotAvatarValue(input.color);
  if (parsed.kind === "image") {
    return input.color.length <= BOT_AVATAR_VALUE_MAX_LENGTH && isBotAvatarValue(input.color)
      ? `r|${input.color}`
      : null;
  }
  if (parsed.kind === "shape") {
    const shape = mobileBotAvatarPresentation(input.color);
    if (shape.kind !== "shape") return null;
    const points = sampledShape(shape.shapePath);
    const color = normalizeColor(shape.color);
    const eye = normalizeColor(shape.eyeColor);
    return points && color && eye ? `s|${color}|${eye}|${points}` : null;
  }
  if (usesLogoAvatar({ color: input.color, avatarSet: input.avatarSet ?? undefined })) {
    const traits = logoAvatarTraits(input.botId, input.color);
    const paint = logoAvatarPaint(traits.color, traits.originalOrange);
    const color = normalizeColor(paint.base);
    const eye = contrastRatio(traits.color, "#101014") >= 3.5 ? "101014" : "FFFFFF";
    const points = sampledShape(LOGO_BODY_PATH, 0, 100, 9);
    return points && color ? `l|${color}|${eye}|${points}` : null;
  }
  if (
    parsed.kind !== "color"
  ) return null;

  const color = normalizeColor(parsed.color);
  if (!color) return null;

  const seed = avatarIdentitySeed(input.botId || input.color);
  const path = organicAvatarPath(seed);
  const tokens = path.match(/[MCZ]|-?\d+(?:\.\d+)?/g);
  if (!tokens || tokens.join("") !== path.replace(/\s+/g, "") || tokens[0] !== "M") return null;
  const coordinates: number[] = [];
  let cursor = 1;
  for (let index = 0; index < 2; index++) coordinates.push(Number(tokens[cursor++]));
  while (tokens[cursor] === "C") {
    cursor++;
    for (let index = 0; index < 6; index++) coordinates.push(Number(tokens[cursor++]));
  }
  if (tokens[cursor] !== "Z" || cursor !== tokens.length - 1) return null;
  const encoded = coordinates.map((coordinate) => {
    const value = Math.round(coordinate * 2) + 128;
    return Number.isFinite(value) && value >= 0 && value <= 255
      ? value.toString(16).padStart(2, "0")
      : "";
  });
  if (encoded.some((value) => !value)) return null;
  const data = encoded.join("");
  if (data.length > MAX_PATH_LENGTH) return null;
  return `o|${color}|${(seed % 9) - 4}|${data}`;
}

function normalizeColor(value: string): string | null {
  const raw = value.startsWith("#") ? value.slice(1) : "";
  const expanded = raw.length === 3
    ? Array.from(raw, (character) => character + character).join("")
    : raw;
  return /^[0-9a-f]{6}$/i.test(expanded) ? expanded.toUpperCase() : null;
}

function sampledShape(path: string, min = -15, extent = 259, offsetY = 0): string | null {
  const tokens = path.match(/[MLCQHZ]|-?\d+(?:\.\d+)?/g);
  if (!tokens || tokens.join("") !== path.replace(/[\s,]+/g, "") || tokens[0] !== "M") return null;
  const segmentCount = tokens.filter((token) =>
    token === "C" || token === "Q" || token === "L" || token === "H",
  ).length;
  if (!segmentCount) return null;
  const steps = Math.max(1, Math.min(8, Math.floor(160 / segmentCount)));
  let cursor = 1;
  let current = [Number(tokens[cursor++]), Number(tokens[cursor++])];
  const points = [current];
  while (cursor < tokens.length && tokens[cursor] !== "Z") {
    const command = tokens[cursor++];
    const count = command === "C" ? 6 : command === "Q" ? 4 : command === "L" ? 2 : command === "H" ? 1 : 0;
    if (!count || cursor + count > tokens.length) return null;
    const values = tokens.slice(cursor, cursor + count).map(Number);
    cursor += count;
    if (values.some((value) => !Number.isFinite(value))) return null;
    const end = command === "H" ? [values[0]!, current[1]!] : values.slice(-2);
    const line = command === "L" || command === "H";
    for (let step = 1; step <= (line ? 1 : steps); step++) {
      const fraction = step / (line ? 1 : steps);
      const inverse = 1 - fraction;
      const position = [0, 1].map((axis) => command === "C"
        ? inverse ** 3 * current[axis]! + 3 * inverse ** 2 * fraction * values[axis]!
          + 3 * inverse * fraction ** 2 * values[axis + 2]! + fraction ** 3 * end[axis]!
        : command === "Q"
          ? inverse ** 2 * current[axis]! + 2 * inverse * fraction * values[axis]!
            + fraction ** 2 * end[axis]!
          : end[axis]!);
      points.push(position);
    }
    current = end;
  }
  if (tokens[cursor] !== "Z" || cursor !== tokens.length - 1) return null;
  const encoded = points.flatMap((point) => point.map((coordinate, axis) =>
    Math.max(0, Math.min(255, Math.round((coordinate + (axis === 1 ? offsetY : 0) - min) * 255 / extent)))
      .toString(16).padStart(2, "0"),
  )).join("");
  return encoded.length <= MAX_PATH_LENGTH ? encoded : null;
}
