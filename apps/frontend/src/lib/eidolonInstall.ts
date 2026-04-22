export type EidolonDesktopResult = {
  ok: boolean;
  status?: 'launched' | 'install_required' | 'installer_opened' | 'download_opened';
  path?: string;
  mode?: string;
  error?: string;
  installerPath?: string;
  downloadUrl?: string;
  infoUrl?: string;
};

export const EIDOLON_PUBLIC_DOWNLOAD_URL =
  import.meta.env.VITE_EIDOLON_DOWNLOAD_URL ||
  'https://github.com/Oykdo/Project_Chimera/releases';

export const EIDOLON_PUBLIC_INFO_URL =
  import.meta.env.VITE_EIDOLON_INFO_URL || EIDOLON_PUBLIC_DOWNLOAD_URL;

export function openPublicEidolonInfo(url?: string) {
  const target = url || EIDOLON_PUBLIC_INFO_URL;
  window.open(target, '_blank', 'noopener,noreferrer');
}
