export interface backendInterface {}
export interface CreateActorOptions {
  agentOptions?: Record<string, unknown>;
}
export class ExternalBlob {
  static fromURL(url: string): ExternalBlob;
  getBytes(): Promise<Uint8Array>;
  onProgress?: (progress: number) => void;
}
export function createActor(
  canisterId: string,
  uploadFile: (file: ExternalBlob) => Promise<Uint8Array>,
  downloadFile: (bytes: Uint8Array) => Promise<ExternalBlob>,
  options?: CreateActorOptions,
): Promise<backendInterface>;
