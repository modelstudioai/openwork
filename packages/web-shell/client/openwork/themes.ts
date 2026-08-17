import catppuccin from '../../../desktop/apps/electron/resources/themes/catppuccin.json';
import defaultTheme from '../../../desktop/apps/electron/resources/themes/default.json';
import dracula from '../../../desktop/apps/electron/resources/themes/dracula.json';
import ghostty from '../../../desktop/apps/electron/resources/themes/ghostty.json';
import github from '../../../desktop/apps/electron/resources/themes/github.json';
import gruvbox from '../../../desktop/apps/electron/resources/themes/gruvbox.json';
import haze from '../../../desktop/apps/electron/resources/themes/haze.json';
import nightOwl from '../../../desktop/apps/electron/resources/themes/night-owl.json';
import nord from '../../../desktop/apps/electron/resources/themes/nord.json';
import oneDarkPro from '../../../desktop/apps/electron/resources/themes/one-dark-pro.json';
import pierre from '../../../desktop/apps/electron/resources/themes/pierre.json';
import rosePine from '../../../desktop/apps/electron/resources/themes/rose-pine.json';
import solarized from '../../../desktop/apps/electron/resources/themes/solarized.json';
import tokyoNight from '../../../desktop/apps/electron/resources/themes/tokyo-night.json';
import vitesse from '../../../desktop/apps/electron/resources/themes/vitesse.json';

interface ThemeColors {
  background: string;
  foreground: string;
  accent: string;
  info: string;
  success: string;
  destructive: string;
}

interface ThemeDefinition extends ThemeColors {
  name: string;
  dark?: ThemeColors;
}

export const OPENWORK_THEMES = {
  catppuccin,
  default: defaultTheme,
  dracula,
  ghostty,
  github,
  gruvbox,
  haze,
  'night-owl': nightOwl,
  nord,
  'one-dark-pro': oneDarkPro,
  pierre,
  'rose-pine': rosePine,
  solarized,
  'tokyo-night': tokyoNight,
  vitesse,
} satisfies Record<string, ThemeDefinition>;

export type OpenWorkThemeId = keyof typeof OPENWORK_THEMES;
export const OPENWORK_THEME_IDS = Object.keys(
  OPENWORK_THEMES,
) as OpenWorkThemeId[];

export function isOpenWorkThemeId(value: unknown): value is OpenWorkThemeId {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(OPENWORK_THEMES, value)
  );
}

export function applyOpenWorkTheme(id: OpenWorkThemeId): void {
  const theme: ThemeDefinition = OPENWORK_THEMES[id];
  let dark = true;
  try {
    dark = localStorage.getItem('qwen-code-web-shell-theme') !== 'light';
  } catch {
    // Keep the dark default when storage is unavailable.
  }
  const colors = dark && theme.dark ? theme.dark : theme;
  const secondary = `color-mix(in srgb, ${colors.background} 92%, ${colors.foreground})`;
  const border = `color-mix(in srgb, ${colors.foreground} 18%, ${colors.background})`;
  const muted = `color-mix(in srgb, ${colors.foreground} 62%, ${colors.background})`;
  const variables: Record<string, string> = {
    '--background': colors.background,
    '--foreground': colors.foreground,
    '--card': colors.background,
    '--card-foreground': colors.foreground,
    '--popover': colors.background,
    '--popover-foreground': colors.foreground,
    '--primary': colors.accent,
    '--primary-foreground': colors.background,
    '--secondary': secondary,
    '--secondary-foreground': colors.foreground,
    '--muted': secondary,
    '--muted-foreground': muted,
    '--accent': secondary,
    '--accent-foreground': colors.foreground,
    '--border': border,
    '--ring': colors.accent,
    '--sidebar-background': colors.background,
    '--sidebar-foreground': colors.foreground,
    '--sidebar-primary': colors.accent,
    '--sidebar-primary-foreground': colors.background,
    '--sidebar-accent': secondary,
    '--sidebar-accent-foreground': colors.foreground,
    '--sidebar-border': border,
    '--sidebar-ring': colors.accent,
    '--success-color': colors.success,
    '--warning-color': colors.info,
    '--error-color': colors.destructive,
    '--chat-editor-bg-primary': secondary,
    '--chat-editor-bg-tertiary': colors.background,
    '--chat-editor-border-color': border,
    '--chat-editor-text-primary': colors.foreground,
    '--chat-editor-text-secondary': muted,
    '--chat-editor-accent-color': colors.accent,
  };
  document
    .querySelectorAll<HTMLElement>(
      '[data-web-shell-root], [data-web-shell-portal-root]',
    )
    .forEach((root) => {
      for (const [name, value] of Object.entries(variables)) {
        root.style.setProperty(name, value);
      }
    });
}
