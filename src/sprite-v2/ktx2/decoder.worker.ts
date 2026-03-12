import {
  BasisUniversal,
  TranscoderTextureFormat,
  type InstantiateWasmAsync,
  type KTX2Transcoder,
} from '@h00w/basis-universal-transcoder';
import wasmDataUrl from '@h00w/basis-universal-transcoder/basis_capi_transcoder.wasm?url&inline';

type DecodeRequest = {
  type: 'decode';
  id: number;
  label: string;
  bytes: ArrayBuffer;
};

type DecodeSuccess = {
  type: 'decoded';
  id: number;
  label: string;
  width: number;
  height: number;
  decodeMs: number;
  rgba: Uint8ClampedArray;
};

type DecodeFailure = {
  type: 'decode-error';
  id: number;
  label: string;
  error: string;
};

type WorkerReady = {
  type: 'ready';
};

const workerScope: any = self as any;

let basisPromise: Promise<BasisUniversal> | null = null;
let transcoder: KTX2Transcoder | null = null;
let readyPosted = false;

function createWasmInstantiator(url: string): InstantiateWasmAsync {
  return async (imports) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load KTX2 wasm: HTTP ${response.status}`);
    }
    const bytes = await response.arrayBuffer();
    return WebAssembly.instantiate(bytes, imports);
  };
}

async function ensureTranscoder(): Promise<KTX2Transcoder> {
  if (!basisPromise) {
    basisPromise = BasisUniversal.getInstance(createWasmInstantiator(wasmDataUrl));
  }
  const basis = await basisPromise;
  if (!transcoder) {
    transcoder = basis.createKTX2Transcoder();
  }
  if (!readyPosted) {
    const msg: WorkerReady = { type: 'ready' };
    workerScope.postMessage(msg);
    readyPosted = true;
  }
  return transcoder;
}

function fail(id: number, label: string, error: unknown): void {
  const message = error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error ?? 'unknown-error');
  const msg: DecodeFailure = { type: 'decode-error', id, label, error: message };
  workerScope.postMessage(msg);
}

async function decode(req: DecodeRequest): Promise<void> {
  const startedAt = performance.now();
  try {
    const decoder = await ensureTranscoder();
    const payload = new Uint8Array(req.bytes);

    if (!decoder.init(payload)) {
      throw new Error('KTX2 init failed');
    }
    if (!decoder.startTranscoding()) {
      throw new Error('KTX2 startTranscoding failed');
    }

    const result = decoder.transcodeImageLevel({
      format: TranscoderTextureFormat.cTFRGBA32,
      level: 0,
      layer: 0,
      face: 0,
    });
    if (!result) {
      throw new Error('KTX2 transcodeImageLevel returned null');
    }

    // Copy out of WASM-backed memory before the next decoder call.
    const copied = new Uint8ClampedArray(result.data.length);
    copied.set(result.data);
    const decodeMs = performance.now() - startedAt;
    const msg: DecodeSuccess = {
      type: 'decoded',
      id: req.id,
      label: req.label,
      width: result.width,
      height: result.height,
      decodeMs,
      rgba: copied,
    };
    workerScope.postMessage(msg, [copied.buffer]);
  } catch (error) {
    fail(req.id, req.label, error);
  }
}

workerScope.addEventListener('message', (event: MessageEvent<DecodeRequest>) => {
  const message = event.data;
  if (!message || message.type !== 'decode') return;
  void decode(message);
});
