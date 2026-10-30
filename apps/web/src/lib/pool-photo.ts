// The pool's own photo, or a temporary one until a photo is uploaded: a coloured tile with the pool's first letter.
export function poolPhoto(name: string, url: string | null): string {
  if (url) {
    return url;
  }
  const letter = (name.trim()[0] ?? "O").toUpperCase();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2fb0c8"/><stop offset="1" stop-color="#0b5d8c"/></linearGradient></defs>` +
    `<rect width="640" height="360" fill="url(#g)"/>` +
    `<text x="320" y="210" font-family="Arial,sans-serif" font-size="150" font-weight="700" fill="#ffffff" fill-opacity="0.85" text-anchor="middle">${letter}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
