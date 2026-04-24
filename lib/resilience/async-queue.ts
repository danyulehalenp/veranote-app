const queue: Array<() => Promise<void>> = [];
let isProcessing = false;

export function enqueue(task: () => Promise<void>) {
  queue.push(task);
  void processQueue();
}

async function processQueue() {
  if (isProcessing || queue.length === 0) {
    return;
  }

  isProcessing = true;

  while (queue.length > 0) {
    const task = queue.shift();
    if (!task) {
      continue;
    }

    try {
      await task();
    } catch {
      // Swallow queue task errors so monitoring persistence never crashes request handling.
    }
  }

  isProcessing = false;
}
