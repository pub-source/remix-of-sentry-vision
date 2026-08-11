/**
 * Electron renderer helper — safe in the browser too.
 * LOCAL-ONLY concern: tells the React app whether it runs in the desktop shell
 * and which localhost services it may talk to.
 */

export interface MsdsDesktopEnv {
  isElectron: boolean;
  isDev: boolean;
  platform: string;
  appVersion: string;
  /** Node local service (FFmpeg/Whisper diagnostics), e.g. http://127.0.0.1:5055 */
  localServiceUrl: string;
  /** Python camera bridge (RTSP -> HLS), e.g. http://127.0.0.1:5000 */
  cameraServerUrl: string;
}

interface MsdsBridge {
  isElectron: true;
  getEnv(): Promise<MsdsDesktopEnv>;
  openExternal(url: string): Promise<void>;
}

declare global {
  interface Window { msds?: MsdsBridge }
}

export const isDesktop = () => typeof window !== 'undefined' && window.msds?.isElectron === true;

export async function getDesktopEnv(): Promise<MsdsDesktopEnv | null> {
  if (!isDesktop()) return null;
  try {
    return await window.msds!.getEnv();
  } catch {
    return null;
  }
}
