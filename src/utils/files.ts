export function readFileAsDataUrl(file: Blob): Promise<string> {
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
