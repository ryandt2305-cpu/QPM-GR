export type Ktx2DecodeResult = {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  decodeMs: number;
};

export type Ktx2DecoderTelemetry = {
  workerReady: boolean;
  decodeAttempts: number;
  decodeSuccesses: number;
  decodeFailures: number;
  totalDecodeMs: number;
};

export type Ktx2DecoderPoolOptions = {
  concurrency?: number;
  decodeTimeoutMs?: number;
};

export type Ktx2DecoderPool = {
  decode(bytes: ArrayBuffer, label: string): Promise<Ktx2DecodeResult>;
  snapshot(): Ktx2DecoderTelemetry;
  destroy(): void;
};
