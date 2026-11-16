/**
 * Generator Angka Acak Deterministik (Mulberry32)
 */
export function createPRNG(seed: number) {
    let s = (seed >>> 0) || 1;
    return function(): number {
        s += 0x6D2B79F5;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

export function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}
