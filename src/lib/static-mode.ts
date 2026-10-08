export const STATIC = process.env.NEXT_PUBLIC_STATIC === '1';
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function dataUrl(file: string): string {
  return `${BASE_PATH}/data/${file}`;
}
