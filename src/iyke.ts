// Iyke runtime constants shared between the shell, the iyke CLI, and any
// MCP/RPC bridge that drives the shell. These are the activity modes the
// shell's sidebar knows about and the names of mini-app surfaces the
// kernel exposes — runtime values, not manifest schema.

/**
 * Activity-bar sidebar modes the shell renders.
 *
 * - The first five (`app`, `files`, `agents`, `sessions`, `settings`) are
 *   core modes always present on the shell.
 * - The remaining are mini-app modes contributed by built-in pkgs.
 *
 * MCP / iyke clients pass these strings to `iyke_mode` to switch the
 * sidebar. Adding a new mode is a non-breaking minor bump (consumers can
 * still pass any of the older modes). Removing or renaming is breaking.
 */
export const ACTIVITY_MODES = [
  'app',
  'files',
  'agents',
  'sessions',
  'settings',
  'storyboard',
  'video-engine',
  'canvas-design',
  'image-generator',
] as const;

export type ActivityMode = (typeof ACTIVITY_MODES)[number];

/**
 * Names of mini-app surfaces the kernel exposes via `iyke_open` with
 * `kind: "mini-app"`. Subset of {@link ACTIVITY_MODES} that map to a
 * full-screen mini-app surface (not a plain sidebar mode).
 */
export const MINI_APP_NAMES = [
  'storyboard',
  'video-engine',
  'canvas-design',
  'image-generator',
] as const;

export type MiniAppName = (typeof MINI_APP_NAMES)[number];
