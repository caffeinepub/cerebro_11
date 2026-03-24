// Stub backend for frontend-only Cerebro app
export interface backendInterface {}
export interface CreateActorOptions {
  agentOptions?: Record<string, unknown>;
}
export class ExternalBlob {
  static fromURL(_url: string): ExternalBlob { return new ExternalBlob(); }
  async getBytes(): Promise<Uint8Array> { return new Uint8Array(); }
  onProgress?: (progress: number) => void;
}
export function createActor(
  _canisterId: string,
  _uploadFile: (file: ExternalBlob) => Promise<Uint8Array>,
  _downloadFile: (bytes: Uint8Array) => Promise<ExternalBlob>,
  _options?: CreateActorOptions,
): Promise<backendInterface> {
  return Promise.resolve({});
}
