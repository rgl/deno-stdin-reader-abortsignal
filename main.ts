// NB this is so complex because we want to make this abortable. without that,
//    the pending Deno.stdin.read call will prevent the application from
//    exiting, so we would have to use Deno.exit() to force the application to
//    exit. an alternative would be use an AbortSignal (like we do here) or
//    call Deno.stdin.close.
// NB this requires Deno 2.8.3+ due to https://github.com/denoland/deno/issues/34985.
async function promptUser(abortSignal: AbortSignal, message: string): Promise<string> {
  await Deno.stdout.write(new TextEncoder().encode(`${message}: `));

  const reader = Deno.stdin.readable.getReader();
  try {
    const abortHandler = async (ev: Event) => {
      const signal = ev.target as AbortSignal;
      console.log(`DEBUG promptUser aborted (${signal.reason})`);
      await reader.cancel(signal.reason);
    };
    abortSignal.addEventListener("abort", abortHandler, { once: true });
    try {
      const chunks: Uint8Array[] = [];
      let result: ReadableStreamReadResult<Uint8Array>;
      while (!(result = await reader.read()).done) {
        chunks.push(result.value);
        if (result.value.includes(10)) {
          break;
        }
      }
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const textBuffer = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        textBuffer.set(chunk, offset);
        offset += chunk.length;
      }
      if (abortSignal.aborted) {
        console.log(`DEBUG promptUser read was aborted (${abortSignal.reason}) and returned ${textBuffer.byteLength} bytes`);
      } else {
        console.log(`DEBUG promptUser read ${textBuffer.byteLength} bytes`);
      }
      return new TextDecoder().decode(textBuffer).trim();
    } finally {
      abortSignal.removeEventListener("abort", abortHandler);
    }
   } finally {
     reader.releaseLock();
  }
}

async function main() {
  const abortController = new AbortController();
  const abortSignal = abortController.signal;

  const timeout = setTimeout(() => abortController.abort("timeout"), 3000);
  try {
    const text = await promptUser(abortSignal, `Enter a text and press ENTER or wait 3 seconds to abort`);
    if (text) {
      console.log(`Entered text: ${text}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

if (import.meta.main) {
  await main();
}
