/** The bytes of a Blob as a data: URL (in the browser and in Node, which has no FileReader). */
export async function readFileAsDataUrl(file: Blob): Promise<string> {
  if (typeof FileReader === 'undefined') {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return `data:${file.type || 'application/octet-stream'};base64,${btoa(binary)}`;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

export function dataUrlToFile(dataUrl: string, name: string, fallbackType: string): File {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new Error('Expected the image as a data: URL.');
  const [, type = fallbackType, base64, payload = ''] = match;
  const text = base64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = Uint8Array.from(text, (char) => char.charCodeAt(0));
  return new File([bytes], name, { type });
}
