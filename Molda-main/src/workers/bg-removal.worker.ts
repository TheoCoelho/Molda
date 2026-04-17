/**
 * Web Worker: executa @imgly/background-removal em thread separada.
 * Isso evita que o processamento ONNX bloqueie a main thread / UI.
 *
 * Protocolo:
 *   IN  → { id: number, buffer: ArrayBuffer }   (imagem PNG transferida)
 *   OUT → { id: number, ok: true,  buffer: ArrayBuffer }  (resultado PNG)
 *       | { id: number, ok: false, error: string }
 */

type RequestMsg = {
  id: number;
  buffer: ArrayBuffer;
};

type ResponseMsg =
  | { id: number; ok: true; buffer: ArrayBuffer }
  | { id: number; ok: false; error: string };

self.onmessage = async (e: MessageEvent<RequestMsg>) => {
  const { id, buffer } = e.data;
  try {
    const { removeBackground } = await import("@imgly/background-removal");
    const inputBlob = new Blob([buffer], { type: "image/png" });
    const resultBlob = await removeBackground(inputBlob, {
      model: "isnet",
      output: { format: "image/png", quality: 1 },
    });
    const resultBuffer = await resultBlob.arrayBuffer();
    (self as unknown as Worker).postMessage(
      { id, ok: true, buffer: resultBuffer } satisfies ResponseMsg,
      [resultBuffer]
    );
  } catch (err) {
    (self as unknown as Worker).postMessage(
      { id, ok: false, error: String(err) } satisfies ResponseMsg
    );
  }
};
