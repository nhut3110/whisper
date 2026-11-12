/** Canonical soft W. geometry for the header, favicon, brand art and social cards. */
export const brand = {
  viewBox: '0 0 64 48',
  path: 'M6 12c4 0 4 25 11 25s7-23 12-23 4 23 11 23 7-25 12-25',
  strokeWidth: 4,
  dot: {x: 59, y: 36, radius: 2.5},
} as const
export function brandSvg(color = 'currentColor') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${brand.viewBox}" style="color:${color}"><path d="${brand.path}" fill="none" stroke="currentColor" stroke-width="${brand.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${brand.dot.x}" cy="${brand.dot.y}" r="${brand.dot.radius}" fill="currentColor" stroke="none"/></svg>`
}
