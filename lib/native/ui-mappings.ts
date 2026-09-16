// CoreSimulator's UI appearance/contrast/content-size setters and getters work in terms of raw
// native enum values, not the friendly strings `xcrun simctl ui` accepts — and `simctl` itself
// does that string<->enum translation internally with no published table. These mappings were
// determined empirically (set via `xcrun simctl ui <udid> ...`, read back via
// `@appium/coresim`'s native getters) rather than from any documented source.

/** Raw `UIUserInterfaceStyle` values `setAppearance`/`getAppearance` accept/return. */
const APPEARANCE_TO_RAW: Record<string, number> = {
  light: 1,
  dark: 2,
};
const RAW_TO_APPEARANCE = invert(APPEARANCE_TO_RAW);

export function appearanceToRaw(value: string): number {
  const raw = APPEARANCE_TO_RAW[value.toLowerCase()];
  if (raw === undefined) {
    throw new Error(
      `'${value}' is not a valid appearance. Use one of: ${JSON.stringify(Object.keys(APPEARANCE_TO_RAW))}`,
    );
  }
  return raw;
}

export function rawToAppearance(raw: number): string {
  return RAW_TO_APPEARANCE[raw] ?? 'unknown';
}

/**
 * `getIncreaseContrast`'s raw `currentIncreaseContrastMode` values — a different (tri-state)
 * native enum than the plain boolean `setIncreaseContrast` takes, so get/set need separate maps.
 * `0` was never observed empirically; treated the same way node-simctl's CLI-based docs describe
 * an unrecognized/unsupported state.
 */
const RAW_TO_CONTRAST: Record<number, string> = {
  0: 'unsupported',
  1: 'disabled',
  2: 'enabled',
};

export function rawToContrast(raw: number): string {
  return RAW_TO_CONTRAST[raw] ?? 'unknown';
}

export function contrastToEnabled(value: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized !== 'enabled' && normalized !== 'disabled') {
    throw new Error(`'${value}' is not a valid increase contrast value. Use 'enabled' or 'disabled'`);
  }
  return normalized === 'enabled';
}

/** Raw `UIContentSizeCategory` values, in the same order `xcrun simctl ui ... content_size` lists them. */
const CONTENT_SIZE_TO_RAW: Record<string, number> = {
  'extra-small': 1,
  small: 2,
  medium: 3,
  large: 4,
  'extra-large': 5,
  'extra-extra-large': 6,
  'extra-extra-extra-large': 7,
  'accessibility-medium': 8,
  'accessibility-large': 9,
  'accessibility-extra-large': 10,
  'accessibility-extra-extra-large': 11,
  'accessibility-extra-extra-extra-large': 12,
};
const RAW_TO_CONTENT_SIZE = invert(CONTENT_SIZE_TO_RAW);

export function contentSizeToRaw(value: string): number {
  const raw = CONTENT_SIZE_TO_RAW[value.toLowerCase()];
  if (raw === undefined) {
    throw new Error(
      `'${value}' is not a valid content size. Use one of: ${JSON.stringify(Object.keys(CONTENT_SIZE_TO_RAW))}`,
    );
  }
  return raw;
}

export function rawToContentSize(raw: number): string {
  return RAW_TO_CONTENT_SIZE[raw] ?? 'unknown';
}

function invert(map: Record<string, number>): Record<number, string> {
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [value, key]));
}
