import * as THREE from 'three';
import { Moon } from './Moon';
import { Rover } from './Rover';
import { ConfigManager } from '../core/Config';

interface TrailSegment {
    l0x: number; l0y: number; l0z: number;
    l1x: number; l1y: number; l1z: number;
    r0x: number; r0y: number; r0z: number;
    r1x: number; r1y: number; r1z: number;
    dist: number;
    alpha: number;
}

/**
 * High-precision dynamic 3D ribbon tire tracks.
 * - Zero-delay continuous tracking behind rear wheels
 * - Soft feathered lateral edges & subtle tire tread pattern (never stiff or pitch-black)
 * - Smooth world-space surface hugging across any moon scale (1x to 6x)
 */
export class RoverTrails {
    private moon: Moon;
    private rover: Rover;

    private readonly MAX_POINTS = 420;
    private segments: TrailSegment[] = [];
    private totalDistance = 0;

    private mesh: THREE.Mesh;
    private geometry: THREE.BufferGeometry;
    private material: THREE.ShaderMaterial;

    private posAttr: THREE.BufferAttribute;
    private alphaAttr: THREE.BufferAttribute;
    private uvAttr: THREE.BufferAttribute; // x = across (-1..1), y = cumulative distance

    private lastStampPos = new THREE.Vector3();
    private hasLastStamp = false;

    // Temporary scratch vectors (zero GC allocations per frame)
    private _tmpWorldPos = new THREE.Vector3();
    private _tmpDir = new THREE.Vector3();
    private _tmpPt = new THREE.Vector3();
    private _tmpColor = new THREE.Color();
    private _darkTint = new THREE.Color('#1E293B');

    constructor(moon: Moon, rover: Rover) {
        this.moon = moon;
        this.rover = rover;

        const maxQuads = this.MAX_POINTS * 2;
        const totalVerts = maxQuads * 4;
        const totalIndices = maxQuads * 6;

        const positions = new Float32Array(totalVerts * 3);
        const alphas = new Float32Array(totalVerts);
        const uvs = new Float32Array(totalVerts * 2);
        const indices = new Uint32Array(totalIndices);

        for (let i = 0; i < maxQuads; i++) {
            const vBase = i * 4;
            const iBase = i * 6;
            indices[iBase]     = vBase;
            indices[iBase + 1] = vBase + 1;
            indices[iBase + 2] = vBase + 2;
            indices[iBase + 3] = vBase;
            indices[iBase + 4] = vBase + 2;
            indices[iBase + 5] = vBase + 3;
        }

        this.geometry = new THREE.BufferGeometry();
        this.posAttr = new THREE.BufferAttribute(positions, 3);
        this.posAttr.setUsage(THREE.DynamicDrawUsage);
        this.geometry.setAttribute('position', this.posAttr);

        this.alphaAttr = new THREE.BufferAttribute(alphas, 1);
        this.alphaAttr.setUsage(THREE.DynamicDrawUsage);
        this.geometry.setAttribute('aAlpha', this.alphaAttr);

        this.uvAttr = new THREE.BufferAttribute(uvs, 2);
        this.uvAttr.setUsage(THREE.DynamicDrawUsage);
        this.geometry.setAttribute('aUv', this.uvAttr);

        this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        this.geometry.setDrawRange(0, 0);

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color('#64748B') },
                uOpacity: { value: 0.24 }
            },
            vertexShader: `
                attribute float aAlpha;
                attribute vec2 aUv;
                varying float vAlpha;
                varying vec2 vUv;
                void main() {
                    vAlpha = aAlpha;
                    vUv = aUv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                uniform float uOpacity;
                varying float vAlpha;
                varying vec2 vUv;
                void main() {
                    if (vAlpha <= 0.005) discard;
                    // Soft feathered lateral edges (eliminates stiff rectangular lines)
                    float edge = 1.0 - smoothstep(0.35, 1.0, abs(vUv.x));
                    // Subtle rover tire tread ribs along the track
                    float tread = 0.78 + 0.22 * sin(vUv.y * 240.0);
                    float finalAlpha = vAlpha * vAlpha * edge * tread * uOpacity;
                    if (finalAlpha <= 0.003) discard;
                    gl_FragColor = vec4(uColor, finalAlpha);
                }
            `,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -8.0,
            polygonOffsetUnits: -10.0,
            side: THREE.DoubleSide
        });

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.renderOrder = 30;
        this.mesh.frustumCulled = false;
        this.moon.group.add(this.mesh);
        this.updateColorFromMoon();
    }

    public updateColorFromMoon(): void {
        if (this.moon.currentPalette) {
            this._tmpColor.set(this.moon.currentPalette.craterColor);
            this._tmpColor.lerp(this._darkTint, 0.38);
            this.material.uniforms.uColor.value.copy(this._tmpColor);
        }
    }

    public clear(): void {
        this.segments.length = 0;
        this.hasLastStamp = false;
        this.totalDistance = 0;
        this.geometry.setDrawRange(0, 0);
    }

    public update(dt: number): void {
        const cfg = ConfigManager.current;
        if (!cfg.trailsEnabled) {
            this.geometry.setDrawRange(0, 0);
            return;
        }

        const isMoving = Math.abs(this.rover.speed) > 0.008;
        this.rover.group.getWorldPosition(this._tmpWorldPos);

        // 1. Stamp dense points + update live tip every frame for ZERO delay
        if (isMoving) {
            if (!this.hasLastStamp) {
                this.stampPoint(0);
                this.lastStampPos.copy(this._tmpWorldPos);
                this.hasLastStamp = true;
            } else {
                const dist = this._tmpWorldPos.distanceTo(this.lastStampPos);
                if (dist >= 0.009) {
                    this.totalDistance += dist;
                    this.stampPoint(this.totalDistance);
                    this.lastStampPos.copy(this._tmpWorldPos);
                } else if (this.segments.length >= 2) {
                    // Continuously pull the newest segment to the live wheel position (zero visual lag)
                    this.updateSegmentInPlace(this.segments[this.segments.length - 1], this.totalDistance + dist);
                }
            }
        } else {
            this.hasLastStamp = false;
        }

        // 2. Fade existing segments smoothly over time
        if (this.segments.length === 0) {
            this.geometry.setDrawRange(0, 0);
            return;
        }

        const fadeDuration = Math.max(1.0, cfg.trailFadeDuration || 8.5);
        const decay = dt / fadeDuration;

        for (let i = 0; i < this.segments.length; i++) {
            this.segments[i].alpha = Math.max(0.0, this.segments[i].alpha - decay);
        }

        while (this.segments.length > 0 && this.segments[0].alpha <= 0.005) {
            this.segments.shift();
        }

        // 3. Rebuild dynamic quad strip mesh
        this.rebuildMeshBuffers();
    }

    private computeSurfacePoint(latOffset: number, out: THREE.Vector3): void {
        const u = this.rover.up;
        const f = this.rover.forward;
        const l = this.rover.left;
        const rearFwdOff = -0.038;
        const R = Math.max(0.5, this.moon.moonScale);
        const invR = 1.0 / R;

        this._tmpDir.copy(u)
            .addScaledVector(f, rearFwdOff * invR)
            .addScaledVector(l, latOffset * invR)
            .normalize();
        const actualR = this.moon.sampleActualSurfaceRadiusAt(this._tmpDir.x, this._tmpDir.y, this._tmpDir.z);
        // Constant tiny world-space lift (+0.0045) above actual surface (clean or dirty) so tracks never sink
        out.copy(this._tmpDir).multiplyScalar(actualR + 0.0045);
    }

    private updateSegmentInPlace(seg: TrailSegment, dist: number): void {
        const wheelLatOff = 0.052;
        const tireHalfW = 0.015;

        this.computeSurfacePoint(wheelLatOff + tireHalfW, this._tmpPt);
        seg.l0x = this._tmpPt.x; seg.l0y = this._tmpPt.y; seg.l0z = this._tmpPt.z;

        this.computeSurfacePoint(wheelLatOff - tireHalfW, this._tmpPt);
        seg.l1x = this._tmpPt.x; seg.l1y = this._tmpPt.y; seg.l1z = this._tmpPt.z;

        this.computeSurfacePoint(-wheelLatOff + tireHalfW, this._tmpPt);
        seg.r0x = this._tmpPt.x; seg.r0y = this._tmpPt.y; seg.r0z = this._tmpPt.z;

        this.computeSurfacePoint(-wheelLatOff - tireHalfW, this._tmpPt);
        seg.r1x = this._tmpPt.x; seg.r1y = this._tmpPt.y; seg.r1z = this._tmpPt.z;

        seg.dist = dist;
        seg.alpha = 1.0;
    }

    private stampPoint(dist: number): void {
        const seg: TrailSegment = {
            l0x: 0, l0y: 0, l0z: 0,
            l1x: 0, l1y: 0, l1z: 0,
            r0x: 0, r0y: 0, r0z: 0,
            r1x: 0, r1y: 0, r1z: 0,
            dist,
            alpha: 1.0
        };
        this.updateSegmentInPlace(seg, dist);
        this.segments.push(seg);

        if (this.segments.length > this.MAX_POINTS) {
            this.segments.shift();
        }
    }

    private rebuildMeshBuffers(): void {
        const count = this.segments.length;
        if (count < 2) {
            this.geometry.setDrawRange(0, 0);
            return;
        }

        const posArr = this.posAttr.array as Float32Array;
        const alphaArr = this.alphaAttr.array as Float32Array;
        const uvArr = this.uvAttr.array as Float32Array;

        let vIdx = 0;
        let quadCount = 0;

        for (let i = 0; i < count - 1; i++) {
            const prev = this.segments[i];
            const curr = this.segments[i + 1];

            // Soft fade-in at the very newest segment right under the wheel
            const tipFadeCurr = i === count - 2 ? 0.55 : 1.0;
            const aPrev = prev.alpha;
            const aCurr = curr.alpha * tipFadeCurr;

            if (aPrev <= 0.005 && aCurr <= 0.005) continue;

            // Left wheel quad
            posArr[vIdx * 3] = prev.l0x; posArr[vIdx * 3 + 1] = prev.l0y; posArr[vIdx * 3 + 2] = prev.l0z;
            uvArr[vIdx * 2] = -1.0; uvArr[vIdx * 2 + 1] = prev.dist;
            alphaArr[vIdx++] = aPrev;

            posArr[vIdx * 3] = prev.l1x; posArr[vIdx * 3 + 1] = prev.l1y; posArr[vIdx * 3 + 2] = prev.l1z;
            uvArr[vIdx * 2] = 1.0; uvArr[vIdx * 2 + 1] = prev.dist;
            alphaArr[vIdx++] = aPrev;

            posArr[vIdx * 3] = curr.l1x; posArr[vIdx * 3 + 1] = curr.l1y; posArr[vIdx * 3 + 2] = curr.l1z;
            uvArr[vIdx * 2] = 1.0; uvArr[vIdx * 2 + 1] = curr.dist;
            alphaArr[vIdx++] = aCurr;

            posArr[vIdx * 3] = curr.l0x; posArr[vIdx * 3 + 1] = curr.l0y; posArr[vIdx * 3 + 2] = curr.l0z;
            uvArr[vIdx * 2] = -1.0; uvArr[vIdx * 2 + 1] = curr.dist;
            alphaArr[vIdx++] = aCurr;
            quadCount++;

            // Right wheel quad
            posArr[vIdx * 3] = prev.r0x; posArr[vIdx * 3 + 1] = prev.r0y; posArr[vIdx * 3 + 2] = prev.r0z;
            uvArr[vIdx * 2] = -1.0; uvArr[vIdx * 2 + 1] = prev.dist;
            alphaArr[vIdx++] = aPrev;

            posArr[vIdx * 3] = prev.r1x; posArr[vIdx * 3 + 1] = prev.r1y; posArr[vIdx * 3 + 2] = prev.r1z;
            uvArr[vIdx * 2] = 1.0; uvArr[vIdx * 2 + 1] = prev.dist;
            alphaArr[vIdx++] = aPrev;

            posArr[vIdx * 3] = curr.r1x; posArr[vIdx * 3 + 1] = curr.r1y; posArr[vIdx * 3 + 2] = curr.r1z;
            uvArr[vIdx * 2] = 1.0; uvArr[vIdx * 2 + 1] = curr.dist;
            alphaArr[vIdx++] = aCurr;

            posArr[vIdx * 3] = curr.r0x; posArr[vIdx * 3 + 1] = curr.r0y; posArr[vIdx * 3 + 2] = curr.r0z;
            uvArr[vIdx * 2] = -1.0; uvArr[vIdx * 2 + 1] = curr.dist;
            alphaArr[vIdx++] = aCurr;
            quadCount++;
        }

        this.posAttr.needsUpdate = true;
        this.alphaAttr.needsUpdate = true;
        this.uvAttr.needsUpdate = true;
        this.geometry.setDrawRange(0, quadCount * 6);
    }
}
