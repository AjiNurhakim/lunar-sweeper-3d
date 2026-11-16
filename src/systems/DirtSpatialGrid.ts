import * as THREE from 'three';

/**
 * Spherical Spatial Grid Partitioning
 * Membagi permukaan bola unit ke dalam sektor latitude (theta) & longitude (phi)
 * untuk membatasi query vertex hanya pada area di bawah rover (~150 vertex vs 20.000+ vertex).
 */
export class DirtSpatialGrid {
    private numLat: number;
    private numLon: number;
    private bins: number[][]; // Array of vertex indices per bin

    constructor(numLat = 24, numLon = 48) {
        this.numLat = numLat;
        this.numLon = numLon;
        this.bins = Array.from({ length: numLat * numLon }, () => []);
    }

    public buildGrid(baseUnitPositions: Float32Array, numVerts: number): void {
        for (let b = 0; b < this.bins.length; b++) {
            this.bins[b].length = 0;
        }

        for (let i = 0; i < numVerts; i++) {
            const idx = i * 3;
            const x = baseUnitPositions[idx];
            const y = baseUnitPositions[idx + 1];
            const z = baseUnitPositions[idx + 2];

            // Spherical angles: theta in [0, PI], phi in [0, 2*PI]
            // y is Up (or z is Up depending on coordinates; here unit sphere: len = 1)
            const clampedY = Math.max(-1, Math.min(1, y));
            const theta = Math.acos(clampedY); // 0 at North Pole, PI at South Pole
            let phi = Math.atan2(z, x); // -PI to PI
            if (phi < 0) phi += Math.PI * 2; // 0 to 2*PI

            const latIdx = Math.min(this.numLat - 1, Math.floor((theta / Math.PI) * this.numLat));
            const lonIdx = Math.min(this.numLon - 1, Math.floor((phi / (Math.PI * 2)) * this.numLon));

            const binIdx = latIdx * this.numLon + lonIdx;
            this.bins[binIdx].push(i);
        }
    }

    /**
     * Mengembalikan daftar indeks vertex yang berada di sekitar posisi bola (centerUnit) dalam radius tertentu
     */
    public queryVerticesNear(centerUnit: THREE.Vector3, angularRadius: number): number[] {
        const clampedY = Math.max(-1, Math.min(1, centerUnit.y));
        const centerTheta = Math.acos(clampedY);
        let centerPhi = Math.atan2(centerUnit.z, centerUnit.x);
        if (centerPhi < 0) centerPhi += Math.PI * 2;

        const minTheta = Math.max(0, centerTheta - angularRadius);
        const maxTheta = Math.min(Math.PI, centerTheta + angularRadius);

        const latMin = Math.floor((minTheta / Math.PI) * this.numLat);
        const latMax = Math.min(this.numLat - 1, Math.floor((maxTheta / Math.PI) * this.numLat));

        // Longitude delta depends on latitude (wider near equator, 2*PI at poles)
        const sinLat = Math.sin(centerTheta);
        const lonDelta = sinLat > 0.05 ? angularRadius / sinLat : Math.PI;

        const results: number[] = [];
        const seen = new Set<number>();

        for (let lat = latMin; lat <= latMax; lat++) {
            if (lonDelta >= Math.PI) {
                // Near pole, include all longitudes for this latitude
                for (let lon = 0; lon < this.numLon; lon++) {
                    const binIdx = lat * this.numLon + lon;
                    const bin = this.bins[binIdx];
                    for (let k = 0; k < bin.length; k++) {
                        const vIdx = bin[k];
                        if (!seen.has(vIdx)) {
                            seen.add(vIdx);
                            results.push(vIdx);
                        }
                    }
                }
            } else {
                let minPhi = centerPhi - lonDelta;
                let maxPhi = centerPhi + lonDelta;

                const lonMin = Math.floor((((minPhi % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * this.numLon);
                const lonMax = Math.floor((((maxPhi % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * this.numLon);

                let lon = lonMin;
                while (true) {
                    const binIdx = lat * this.numLon + lon;
                    const bin = this.bins[binIdx];
                    for (let k = 0; k < bin.length; k++) {
                        const vIdx = bin[k];
                        if (!seen.has(vIdx)) {
                            seen.add(vIdx);
                            results.push(vIdx);
                        }
                    }
                    if (lon === lonMax) break;
                    lon = (lon + 1) % this.numLon;
                }
            }
        }

        return results;
    }
}
