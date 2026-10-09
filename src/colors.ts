/** Default palette: greys, vivid, light and dark tones (10 per row). */
export const DEFAULT_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
  '#d92d20', '#f97316', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef',
  '#fecaca', '#fed7aa', '#fef08a', '#d9f99d', '#bbf7d0', '#99f6e4', '#a5f3fc', '#bfdbfe', '#ddd6fe', '#f5d0fe',
  '#7f1d1d', '#7c2d12', '#713f12', '#365314', '#14532d', '#134e4a', '#164e63', '#1e3a8a', '#4c1d95', '#701a75',
];

/** hex, rgb()/rgba(), or the two reset keywords. No letters beyond rgb/rgba, so no url() or var(). */
export const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|transparent|inherit)$/i;
