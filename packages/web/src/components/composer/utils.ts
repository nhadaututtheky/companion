/** Concatenate `a + b` with a single space between, unless `a` already ends in whitespace or is empty. */
export function joinWithSpace(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a.endsWith(" ") ? a + b : `${a} ${b}`;
}

/** Read an image File as base64 (without the `data:…;base64,` prefix). Resolves `null` on read failure. */
export function readImageAsBase64(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
