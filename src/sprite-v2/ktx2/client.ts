import DecoderWorker from './decoder.worker?worker&inline';
import type {
  Ktx2DecodeResult,
  Ktx2DecoderPool,
  Ktx2DecoderPoolOptions,
  Ktx2DecoderTelemetry,
} from './types';

type WorkerDecodeRequest = {
  type: 'decode';
  id: number;
  label: string;
  bytes: ArrayBuffer;
};

type WorkerDecodeSuccess = {
  type: 'decoded';
  id: number;
  label: string;
  width: number;
  height: number;
  decodeMs: number;
  rgba: Uint8ClampedArray;
};

type WorkerDecodeError = {
  type: 'decode-error';
  id: number;
  label: string;
  error: string;
};

type WorkerReady = {
  type: 'ready';
};

type WorkerInbound = WorkerDecodeSuccess | WorkerDecodeError | WorkerReady;

type DecodeTask = {
  id: number;
  label: string;
  bytes: ArrayBuffer;
  resolve: (result: Ktx2DecodeResult) => void;
  reject: (error: Error) => void;
};

type InFlightTask = {
  task: DecodeTask;
  slotIndex: number;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
};

type WorkerSlot = {
  worker: Worker;
  busy: boolean;
};

const DEFAULT_CONCURRENCY = 2;
const DEFAULT_DECODE_TIMEOUT_MS = 9000;

function createInitialTelemetry(): Ktx2DecoderTelemetry {
  return {
    workerReady: false,
    decodeAttempts: 0,
    decodeSuccesses: 0,
    decodeFailures: 0,
    totalDecodeMs: 0,
  };
}

export function createKtx2DecoderPool(options: Ktx2DecoderPoolOptions = {}): Ktx2DecoderPool {
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? DEFAULT_CONCURRENCY));
  const decodeTimeoutMs = Math.max(1000, Math.floor(options.decodeTimeoutMs ?? DEFAULT_DECODE_TIMEOUT_MS));
  const telemetry = createInitialTelemetry();
  const queue: DecodeTask[] = [];
  const inFlight = new Map<number, InFlightTask>();
  const slots: WorkerSlot[] = [];
  let nextTaskId = 1;
  let destroyed = false;

  const handleMessage = (event: MessageEvent<WorkerInbound>): void => {
    const message = event.data;
    if (!message) return;

    if (message.type === 'ready') {
      telemetry.workerReady = true;
      return;
    }

    if (message.type === 'decoded') {
      const task = releaseTask(message.id);
      if (!task) return;
      telemetry.decodeSuccesses += 1;
      telemetry.totalDecodeMs += Number(message.decodeMs) || 0;
      task.resolve({
        width: message.width,
        height: message.height,
        rgba: message.rgba,
        decodeMs: Number(message.decodeMs) || 0,
      });
      return;
    }

    if (message.type === 'decode-error') {
      const task = releaseTask(message.id);
      if (!task) return;
      telemetry.decodeFailures += 1;
      task.reject(new Error(message.error || `KTX2 decode failed for ${message.label}`));
    }
  };

  const attachWorkerListeners = (worker: Worker): void => {
    worker.addEventListener('message', handleMessage as EventListener);
    worker.addEventListener('error', handleWorkerError as EventListener);
  };

  const detachWorkerListeners = (worker: Worker): void => {
    worker.removeEventListener('message', handleMessage as EventListener);
    worker.removeEventListener('error', handleWorkerError as EventListener);
  };

  const recycleWorkerSlot = (slotIndex: number): void => {
    const oldSlot = slots[slotIndex];
    if (oldSlot?.worker) {
      detachWorkerListeners(oldSlot.worker);
      oldSlot.worker.terminate();
    }
    const worker = new DecoderWorker();
    attachWorkerListeners(worker);
    slots[slotIndex] = { worker, busy: false };
    telemetry.workerReady = false;
  };

  const rejectTask = (task: DecodeTask, error: Error): void => {
    telemetry.decodeFailures += 1;
    task.reject(error);
  };

  const releaseById = (id: number): InFlightTask | null => {
    const flight = inFlight.get(id);
    if (!flight) return null;
    inFlight.delete(id);
    if (flight.timeoutHandle) {
      clearTimeout(flight.timeoutHandle);
    }
    const slot = slots[flight.slotIndex];
    if (slot) slot.busy = false;
    return flight;
  };

  const handleTaskTimeout = (taskId: number): void => {
    const flight = releaseById(taskId);
    if (!flight) return;
    recycleWorkerSlot(flight.slotIndex);
    rejectTask(flight.task, new Error(`KTX2 decode timeout after ${decodeTimeoutMs}ms (${flight.task.label})`));
    schedule();
  };

  const schedule = (): void => {
    if (destroyed) return;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (!slot || slot.busy) continue;
      const task = queue.shift();
      if (!task) break;
      slot.busy = true;
      const request: WorkerDecodeRequest = {
        type: 'decode',
        id: task.id,
        label: task.label,
        bytes: task.bytes,
      };
      const timeoutHandle = setTimeout(() => handleTaskTimeout(task.id), decodeTimeoutMs);
      inFlight.set(task.id, { task, slotIndex: i, timeoutHandle });
      try {
        slot.worker.postMessage(request, [task.bytes]);
      } catch (error) {
        releaseById(task.id);
        recycleWorkerSlot(i);
        rejectTask(task, error instanceof Error ? error : new Error(String(error ?? 'worker-post-failed')));
      }
    }
  };

  const releaseTask = (id: number): DecodeTask | null => {
    const flight = releaseById(id);
    if (!flight) return null;
    schedule();
    return flight.task;
  };

  const handleWorkerError = (error: ErrorEvent): void => {
    const sourceWorker = (error.currentTarget || error.target) as Worker | null;
    const slotIndex = sourceWorker ? slots.findIndex((slot) => slot.worker === sourceWorker) : -1;
    const failure = `KTX2 worker error: ${error.message || 'unknown'}`;

    if (slotIndex >= 0) {
      const impacted = Array.from(inFlight.entries())
        .filter(([, flight]) => flight.slotIndex === slotIndex)
        .map(([taskId, flight]) => ({ taskId, task: flight.task }));
      recycleWorkerSlot(slotIndex);
      for (const impactedTask of impacted) {
        releaseById(impactedTask.taskId);
        rejectTask(impactedTask.task, new Error(failure));
      }
      schedule();
      return;
    }

    const anyInFlight = Array.from(inFlight.values());
    for (const flight of anyInFlight) {
      releaseById(flight.task.id);
      rejectTask(flight.task, new Error(failure));
    }
    for (let i = 0; i < slots.length; i++) {
      recycleWorkerSlot(i);
    }
    schedule();
  };

  for (let i = 0; i < concurrency; i++) {
    const worker = new DecoderWorker();
    attachWorkerListeners(worker);
    slots.push({ worker, busy: false });
  }

  return {
    decode(bytes: ArrayBuffer, label: string): Promise<Ktx2DecodeResult> {
      if (destroyed) {
        return Promise.reject(new Error('KTX2 decoder pool destroyed'));
      }
      const taskId = nextTaskId++;
      telemetry.decodeAttempts += 1;
      return new Promise<Ktx2DecodeResult>((resolve, reject) => {
        queue.push({
          id: taskId,
          label,
          bytes,
          resolve,
          reject,
        });
        schedule();
      });
    },

    snapshot(): Ktx2DecoderTelemetry {
      return { ...telemetry };
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;

      while (queue.length > 0) {
        const task = queue.shift();
        task?.reject(new Error('KTX2 decoder pool destroyed'));
      }

      for (const [, flight] of inFlight) {
        if (flight.timeoutHandle) {
          clearTimeout(flight.timeoutHandle);
        }
        flight.task.reject(new Error('KTX2 decoder pool destroyed'));
      }
      inFlight.clear();

      for (const slot of slots) {
        detachWorkerListeners(slot.worker);
        slot.worker.terminate();
      }
      slots.length = 0;
    },
  };
}