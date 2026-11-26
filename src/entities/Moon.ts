import * as THREE from 'three';
import { createPRNG, smoothstep } from '../core/MathUtils';
import { DirtSpatialGrid } from '../systems/DirtSpatialGrid';
import { ConfigManager } from '../core/Config';
import { MOON_PALETTES, MoonPalette } from './MoonPalettes';
import { attachOutline } from '../core/OutlineUtils';

export { MOON_PALETTES };
export type { MoonPalette };

export interface Crater {
    cx: number;
    cy: number;
    cz: number;
    radius: number;
    depth: number;
}

export class Moon {
    public group: THREE.Group;
    public mesh!: THREE.Mesh;
    public geometry!: THREE.BufferGeometry;
    public material!: THREE.ShaderMaterial;

    public baseUnitPositions!: Float32Array;
    public cleanRadii!: Float32Array;
    public dirtAmounts!: Float32Array;
    public dirtTiers!: Float32Array;
    public trailAmounts!: Float32Array;
    public activeTrailIndices: Set<number> = new Set();

    // High-resolution GPU-painted 2048x1024 ping-pong RenderTargets (zero CPU upload, silky smooth at any moonScale!)
    public readonly dirtTexWidth = 2048;
    public readonly dirtTexHeight = 1024;
    private renderer: THREE.WebGLRenderer | null = null;
    private dirtRT_A!: THREE.WebGLRenderTarget;
    private dirtRT_B!: THREE.WebGLRenderTarget;
    private readRT!: THREE.WebGLRenderTarget;
    private writeRT!: THREE.WebGLRenderTarget;
    private rtScene!: THREE.Scene;
    private rtCamera!: THREE.OrthographicCamera;
    private rtQuad!: THREE.Mesh;
    private rtInitMat!: THREE.ShaderMaterial;
    private rtBrushMat!: THREE.ShaderMaterial;
    private _tmpSampleVec = new THREE.Vector3();

    public numVerts = 0;
    public totalDirtSum = 0;
    public initialTotalDirt = 0;
    public dirtHeight = 0.012;

    public currentPalette: MoonPalette = MOON_PALETTES[0];
    public craters: Crater[] = [];
    public spatialGrid: DirtSpatialGrid;

    public seed = 101;
    public moonScale = 1.0;
    public p1 = 1.2;
    public p2 = 2.4;
    public p3 = 3.1;
    public bumpAmt = 0.008;

    constructor(scene: THREE.Scene, renderer?: THREE.WebGLRenderer) {
        this.group = new THREE.Group();
        scene.add(this.group);
        this.renderer = renderer || null;
        this.spatialGrid = new DirtSpatialGrid(48, 96);

        this.initDirtRenderTargets();
        this.initGeometry(6); // Detail 6 (40,962 vertices, 81,920 faces — high FPS + 2048x1024 GPU dirt map!)
        this.initMaterial();
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        attachOutline(this.mesh, { width: 0.012 });
        this.group.add(this.mesh);
    }

    private initDirtRenderTargets(): void {
        const rtOpts: THREE.RenderTargetOptions = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            wrapS: THREE.RepeatWrapping,
            wrapT: THREE.ClampToEdgeWrapping,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            depthBuffer: false,
            stencilBuffer: false
        };
        this.dirtRT_A = new THREE.WebGLRenderTarget(this.dirtTexWidth, this.dirtTexHeight, rtOpts);
        this.dirtRT_B = new THREE.WebGLRenderTarget(this.dirtTexWidth, this.dirtTexHeight, rtOpts);
        this.readRT = this.dirtRT_A;
        this.writeRT = this.dirtRT_B;

        this.rtScene = new THREE.Scene();
        this.rtCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        this.rtInitMat = new THREE.ShaderMaterial({
            uniforms: {
                uSeed: { value: 101.0 },
                uLandingPadY: { value: new THREE.Vector2(0.877, 0.904) }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = position.xy * 0.5 + 0.5;
                    gl_Position = vec4(position.xy, 0.0, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uSeed;
                uniform vec2 uLandingPadY;
                varying vec2 vUv;

                void main() {
                    float phi = vUv.x * 6.28318530718;
                    float theta = vUv.y * 3.14159265359;
                    float sinT = sin(theta);
                    float ux = sinT * cos(phi);
                    float uy = cos(theta);
                    float uz = sinT * sin(phi);

                    float uyOuter = uLandingPadY.x;
                    float uyInner = uLandingPadY.y;

                    float dirt = 0.0;
                    if (uy >= uyInner) {
                        dirt = 0.0;
                    } else if (uy <= uyOuter) {
                        dirt = 1.0;
                    } else {
                        float t = (uyInner - uy) / max(0.0001, uyInner - uyOuter);
                        dirt = t * t * (3.0 - 2.0 * t);
                    }

                    float tierVal = 0.0; // Tier 1 = 0.0, Tier 2 = 0.5, Tier 3 = 1.0
                    if (uy < uyOuter) {
                        float distFromBase = max(0.0, (uyOuter - uy) / (uyOuter + 1.0));
                        float patchNoise = sin(ux * 4.8 + uSeed) * 0.07 +
                                           cos(uz * 4.8 + uSeed * 0.7) * 0.07 +
                                           sin(uy * 3.6) * 0.04;
                        float effectiveDist = distFromBase + patchNoise;
                        if (distFromBase < 0.14 || effectiveDist < 0.30) {
                            tierVal = 0.0;
                        } else if (effectiveDist < 0.65) {
                            tierVal = 0.5;
                        } else {
                            tierVal = 1.0;
                        }
                    }

                    gl_FragColor = vec4(dirt, tierVal, 0.0, 1.0);
                }
            `,
            depthTest: false,
            depthWrite: false
        });

        this.rtBrushMat = new THREE.ShaderMaterial({
            uniforms: {
                uPrevDirtMap: { value: this.readRT.texture },
                uP0: { value: new THREE.Vector3() },
                uP1: { value: new THREE.Vector3() },
                uFwd: { value: new THREE.Vector3(0, 0, 1) },
                uLeft: { value: new THREE.Vector3(1, 0, 0) },
                uHalfWidth: { value: 0.1 },
                uHalfDepth: { value: 0.026 },
                uSweepRate: { value: 1.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = position.xy * 0.5 + 0.5;
                    gl_Position = vec4(position.xy, 0.0, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D uPrevDirtMap;
                uniform vec3 uP0;
                uniform vec3 uP1;
                uniform vec3 uFwd;
                uniform vec3 uLeft;
                uniform float uHalfWidth;
                uniform float uHalfDepth;
                uniform float uSweepRate;
                varying vec2 vUv;

                void main() {
                    vec4 prev = texture2D(uPrevDirtMap, vUv);
                    if (prev.r <= 0.001) {
                        gl_FragColor = prev;
                        return;
                    }

                    float phi = vUv.x * 6.28318530718;
                    float theta = vUv.y * 3.14159265359;
                    float sinT = sin(theta);
                    vec3 v = vec3(sinT * cos(phi), cos(theta), sinT * sin(phi));

                    vec3 seg = uP1 - uP0;
                    float segLenSq = dot(seg, seg);
                    vec3 c = uP1;
                    if (segLenSq > 0.0000001) {
                        float t = clamp(dot(v - uP0, seg) / segLenSq, 0.0, 1.0);
                        c = uP0 + t * seg;
                    }

                    vec3 d = v - c;
                    float newR = prev.r;
                    // Strictly restrict brush to the front hemisphere around c (prevents antipodal mirror-sweeping!)
                    if (dot(v, c) > 0.3) {
                        float normLat = abs(dot(d, uLeft)) / uHalfWidth;
                        float normFwd = abs(dot(d, uFwd)) / uHalfDepth;

                        if (normLat <= 1.06 && normFwd <= 1.08) {
                            float wLat = 1.0 - smoothstep(0.72, 1.06, normLat);
                            float wFwd = 1.0 - smoothstep(0.65, 1.08, normFwd);
                            float weight = wLat * wFwd;
                            newR = max(0.0, prev.r - uSweepRate * weight);
                        }
                    }

                    gl_FragColor = vec4(newR, prev.g, prev.b, 1.0);
                }
            `,
            depthTest: false,
            depthWrite: false
        });

        this.rtQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.rtInitMat);
        this.rtScene.add(this.rtQuad);
    }

    private initGeometry(detail: number): void {
        const t = (1 + Math.sqrt(5)) / 2;
        const rawVerts = [
            [-1,  t,  0], [ 1,  t,  0], [-1, -t,  0], [ 1, -t,  0],
            [ 0, -1,  t], [ 0,  1,  t], [ 0, -1, -t], [ 0,  1, -t],
            [ t,  0, -1], [ t,  0,  1], [-t,  0, -1], [-t,  0,  1]
        ];

        const verts = rawVerts.map(([x, y, z]) => {
            const len = Math.hypot(x, y, z);
            return [x / len, y / len, z / len];
        });

        let faces = [
            [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
            [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
            [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
            [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
        ];

        for (let d = 0; d < detail; d++) {
            const midpointCache = new Map<string, number>();
            const nextFaces: number[][] = [];

            const getMidpoint = (i1: number, i2: number): number => {
                const key = i1 < i2 ? `${i1}_${i2}` : `${i2}_${i1}`;
                if (midpointCache.has(key)) return midpointCache.get(key)!;

                const v1 = verts[i1];
                const v2 = verts[i2];
                const mx = (v1[0] + v2[0]) * 0.5;
                const my = (v1[1] + v2[1]) * 0.5;
                const mz = (v1[2] + v2[2]) * 0.5;
                const len = Math.hypot(mx, my, mz);

                const idx = verts.length;
                verts.push([mx / len, my / len, mz / len]);
                midpointCache.set(key, idx);
                return idx;
            };

            for (let i = 0; i < faces.length; i++) {
                const [a, b, c] = faces[i];
                const ab = getMidpoint(a, b);
                const bc = getMidpoint(b, c);
                const ca = getMidpoint(c, a);

                nextFaces.push([a, ab, ca]);
                nextFaces.push([b, bc, ab]);
                nextFaces.push([c, ca, bc]);
                nextFaces.push([ab, bc, ca]);
            }
            faces = nextFaces;
        }

        this.numVerts = verts.length;
        this.baseUnitPositions = new Float32Array(this.numVerts * 3);
        const positions = new Float32Array(this.numVerts * 3);
        const normals = new Float32Array(this.numVerts * 3);
        this.dirtAmounts = new Float32Array(this.numVerts);
        this.dirtTiers = new Float32Array(this.numVerts);
        this.trailAmounts = new Float32Array(this.numVerts);

        this.cleanRadii = new Float32Array(this.numVerts);

        for (let i = 0; i < this.numVerts; i++) {
            const idx = i * 3;
            this.baseUnitPositions[idx]     = verts[i][0];
            this.baseUnitPositions[idx + 1] = verts[i][1];
            this.baseUnitPositions[idx + 2] = verts[i][2];

            positions[idx]     = verts[i][0];
            positions[idx + 1] = verts[i][1];
            positions[idx + 2] = verts[i][2];

            normals[idx]     = verts[i][0];
            normals[idx + 1] = verts[i][1];
            normals[idx + 2] = verts[i][2];
        }

        const indices = new Uint32Array(faces.length * 3);
        for (let i = 0; i < faces.length; i++) {
            const idx = i * 3;
            indices[idx]     = faces[i][0];
            indices[idx + 1] = faces[i][1];
            indices[idx + 2] = faces[i][2];
        }

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        this.geometry.setAttribute('aDirt', new THREE.BufferAttribute(this.dirtAmounts, 1));
        this.geometry.setAttribute('aDirtTier', new THREE.BufferAttribute(this.dirtTiers, 1));
        this.geometry.setAttribute('aTrail', new THREE.BufferAttribute(this.trailAmounts, 1));
        this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));

        this.spatialGrid.buildGrid(this.baseUnitPositions, this.numVerts);
    }

    private initMaterial(): void {
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uMoonScale: { value: 1.0 },
                uLightDir: { value: new THREE.Vector3(-0.55, 0.56, 0.62).normalize() },
                uLightColor: { value: new THREE.Color('#FFFDF7') },
                uBaseColor: { value: new THREE.Color('#B8B5E6') },
                uCraterColor: { value: new THREE.Color('#9590D0') },
                uRimColor: { value: new THREE.Color('#DAD7FA') },
                uDirtColor1: { value: new THREE.Color('#38BDF8') },
                uDirtColor2: { value: new THREE.Color('#FACC15') },
                uDirtColor3: { value: new THREE.Color('#EF4444') },
                uDirtHighlight: { value: new THREE.Color('#8A80A6') },
                uIntensity: { value: 1.15 },
                uShadowBrightness: { value: 0.48 },
                uSoftness: { value: 0.55 },
                uCraterCount: { value: 0 },
                uCraters: { value: Array.from({ length: 36 }, () => new THREE.Vector4(0, 0, 0, 0)) },
                uCraterDepths: { value: new Float32Array(36) },
                uLandingPadY: { value: new THREE.Vector2(0.877, 0.904) },
                uDirtMap: { value: this.readRT.texture }
            },
            vertexShader: `
                attribute float aDirt;
                attribute float aDirtTier;
                attribute float aTrail;

                varying vec3 vNormalWorld;
                varying vec3 vViewDirWorld;
                varying vec3 vLocalDir;
                varying float vTrail;

                // IQ 1-Tap Smooth Cubic Hermite Texture Filter (eliminates bilinear grid kinks & pixelation)
                vec4 sampleSmoothDirt(sampler2D tex, vec2 uv) {
                    vec2 texSize = vec2(2048.0, 1024.0);
                    vec2 p = uv * texSize + 0.5;
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    vec2 smoothUv = (i + f - 0.5) / texSize;
                    return texture2D(tex, smoothUv);
                }

                void main() {
                    vTrail = aTrail;
                    vLocalDir = normalize(position);

                    vec4 worldPos = modelMatrix * vec4(position, 1.0);
                    vNormalWorld = normalize(mat3(modelMatrix) * normal);
                    vViewDirWorld = cameraPosition - worldPos.xyz;

                    gl_Position = projectionMatrix * viewMatrix * worldPos;
                }
            `,
            fragmentShader: `
                uniform vec3 uLightDir;
                uniform vec3 uLightColor;
                uniform vec3 uBaseColor;
                uniform vec3 uCraterColor;
                uniform vec3 uRimColor;
                uniform vec3 uDirtColor1;
                uniform vec3 uDirtColor2;
                uniform vec3 uDirtColor3;
                uniform vec3 uDirtHighlight;
                uniform float uIntensity;
                uniform float uShadowBrightness;
                uniform float uSoftness;
                uniform int uCraterCount;
                uniform vec4 uCraters[36];
                uniform float uCraterDepths[36];
                uniform vec2 uLandingPadY;
                uniform float uMoonScale;
                uniform sampler2D uDirtMap;

                varying vec3 vNormalWorld;
                varying vec3 vViewDirWorld;
                varying vec3 vLocalDir;
                varying float vTrail;

                // Continuous, organic smooth 3D value noise (creates soft, velvety lunar regolith gradients)
                float hash3D(vec3 p) {
                    p = fract(p * 0.3183099 + 0.1);
                    p *= 17.0;
                    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
                }

                float smoothNoise3D(vec3 p) {
                    vec3 i = floor(p);
                    vec3 f = fract(p);
                    vec3 u = f * f * (3.0 - 2.0 * f); // Cubic Hermite curve for smooth continuous transition

                    return mix(
                        mix(
                            mix(hash3D(i + vec3(0.0, 0.0, 0.0)), hash3D(i + vec3(1.0, 0.0, 0.0)), u.x),
                            mix(hash3D(i + vec3(0.0, 1.0, 0.0)), hash3D(i + vec3(1.0, 1.0, 0.0)), u.x),
                            u.y
                        ),
                        mix(
                            mix(hash3D(i + vec3(0.0, 0.0, 1.0)), hash3D(i + vec3(1.0, 0.0, 1.0)), u.x),
                            mix(hash3D(i + vec3(0.0, 1.0, 1.0)), hash3D(i + vec3(1.0, 1.0, 1.0)), u.x),
                            u.y
                        ),
                        u.z
                    );
                }

                // IQ 1-Tap Smooth Cubic Hermite Texture Filter (eliminates bilinear grid kinks & pixelation)
                vec4 sampleSmoothDirt(sampler2D tex, vec2 uv) {
                    vec2 texSize = vec2(2048.0, 1024.0);
                    vec2 p = uv * texSize + 0.5;
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);
                    vec2 smoothUv = (i + f - 0.5) / texSize;
                    return texture2D(tex, smoothUv);
                }

                void main() {
                    vec3 dir = normalize(vLocalDir);
                    vec3 N = normalize(vNormalWorld);
                    vec3 L = normalize(uLightDir);
                    vec3 V = normalize(vViewDirWorld);
                    vec3 H = normalize(L + V);

                    // 1. Procedural Multi-Tier Crater Evaluation (Flat-bottomed clay bowls, central hero peak & crisp rims)
                    float pitFactor = 0.0;
                    float rimFactor = 0.0;
                    vec3 craterSlopeVec = vec3(0.0);

                    for (int c = 0; c < 36; c++) {
                        if (c >= uCraterCount) break;
                        vec4 cr = uCraters[c];
                        vec3 cCenter = cr.xyz;
                        float cRad = cr.w;
                        float cDepth = uCraterDepths[c];

                        vec3 diff = dir - cCenter;
                        float distSq = dot(diff, diff);
                        float maxR = cRad * 1.65;

                        if (distSq < maxR * maxR) {
                            float dist = sqrt(distSq);
                            float invRad = 1.0 / cRad;
                            float x = dist * invRad;
                            vec3 radialDir = diff / max(dist, 0.0001);

                            // Sculpted flat-bottomed lunar bowl (steep inner wall, wide floor)
                            if (x < 1.0) {
                                float h = clamp(1.0 - x * x, 0.0, 1.0);
                                float bowl = smoothstep(0.0, 0.78, h);
                                // Gentle central rebound dome on large hero craters
                                float peak = (cDepth > 0.028 && x < 0.28) ? (1.0 - smoothstep(0.0, 0.28, x)) * 0.22 : 0.0;
                                float netPit = max(0.0, bowl - peak);
                                pitFactor = max(pitFactor, netPit);

                                float wallSlope = (h > 0.0 && h < 0.78) ? (-2.2 * x * invRad * cDepth) : 0.0;
                                float peakSlope = (cDepth > 0.028 && x < 0.28) ? (1.4 * x * invRad * cDepth) : 0.0;
                                craterSlopeVec += radialDir * (wallSlope + peakSlope);
                            }

                            // Crisp raised crater rim + soft outer ejecta skirt
                            if (x > 0.58 && x < 1.65) {
                                float rimDist = abs(x - 1.02);
                                float rimCurve = max(0.0, 1.0 - rimDist * 3.4);
                                rimCurve = rimCurve * rimCurve;
                                rimFactor = max(rimFactor, rimCurve);

                                float dRim = (x < 1.02 ? 1.0 : -0.7) * rimCurve * invRad * cDepth * 0.55;
                                craterSlopeVec += radialDir * dRim;
                            }
                        }
                    }

                    // Smoothly curve normal using analytical crater gradient
                    float scaleFreq = max(0.5, uMoonScale);
                    N = normalize(N - craterSlopeVec * 0.88);

                    // Calculate clean moon surface color per pixel (richer clay crater depth & rim highlight)
                    vec3 cleanColor = uBaseColor;
                    if (pitFactor > 0.005) {
                        float smoothPit = smoothstep(0.0, 0.92, pitFactor);
                        cleanColor = mix(cleanColor, uCraterColor, min(0.52, smoothPit * 0.48));
                    }
                    if (rimFactor > 0.01 && pitFactor < 0.28) {
                        cleanColor = mix(cleanColor, uRimColor, min(0.38, rimFactor * 0.34));
                    }

                    // 2. Per-Pixel 2048x1024 Smooth Cubic Dirt & Multi-Tier Sampling
                    float phi = atan(dir.z, dir.x);
                    float dirtU = phi / 6.28318530718;
                    if (dirtU < 0.0) dirtU += 1.0;
                    float dirtV = acos(clamp(dir.y, -1.0, 1.0)) / 3.14159265359;
                    vec4 dirtSample = sampleSmoothDirt(uDirtMap, vec2(dirtU, dirtV));
                    float texDirt = dirtSample.r;
                    float texTier = dirtSample.g * 2.0 + 1.0;

                    vec3 baseDirt;
                    if (texTier <= 1.0) {
                        baseDirt = uDirtColor1;
                    } else if (texTier <= 2.0) {
                        float t = smoothstep(1.0, 2.0, texTier);
                        baseDirt = mix(uDirtColor1, uDirtColor2, t);
                    } else {
                        float t = smoothstep(2.0, 3.0, texTier);
                        baseDirt = mix(uDirtColor2, uDirtColor3, t);
                    }

                    // Smoothly darken craters on the dirty layer using per-pixel pitFactor
                    if (pitFactor > 0.05) {
                        baseDirt *= (1.0 - smoothstep(0.05, 0.70, pitFactor) * 0.35);
                    }

                    // Smooth stylized clay shading (soft low-contrast variation, zero static/grain noise)
                    float clayWave = smoothNoise3D(dir * (26.0 * scaleFreq));
                    vec3 dustySurface = mix(baseDirt, uDirtHighlight, clayWave * 0.12);

                    // Procedural North Pole Landing Pad (Rocket Base circular zone)
                    float landingPadClean = smoothstep(uLandingPadY.x, uLandingPadY.y, dir.y);
                    float effectiveDirt = texDirt * (1.0 - landingPadClean);

                    // Silky-smooth, crisp clay edge (zero blur and zero pixel staircases)
                    float dirtMask = smoothstep(0.32, 0.68, effectiveDirt);

                    // Smooth 3D clay bevel normal (sampled with IQ cubic filter across 2048x1024 RT)
                    float epsU = 2.0 / 2048.0;
                    float epsV = 2.0 / 1024.0;
                    float hR = sampleSmoothDirt(uDirtMap, vec2(dirtU + epsU, dirtV)).r * (1.0 - landingPadClean);
                    float hD = sampleSmoothDirt(uDirtMap, vec2(dirtU, min(1.0, dirtV + epsV))).r * (1.0 - landingPadClean);
                    vec3 upRef = abs(dir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
                    vec3 tanU = normalize(cross(upRef, dir));
                    vec3 tanV = normalize(cross(dir, tanU));
                    float dU = hR - effectiveDirt;
                    float dV = hD - effectiveDirt;
                    N = normalize(N - (tanU * dU + tanV * dV) * 0.85);

                    // Subtle clay rim highlight on the dust edge
                    float edgeRim = smoothstep(0.28, 0.52, effectiveDirt) * (1.0 - smoothstep(0.52, 0.78, effectiveDirt));
                    dustySurface += vec3(0.04, 0.036, 0.032) * edgeRim;

                    vec3 baseAlbedo = mix(cleanColor, dustySurface, dirtMask);

                    // 3. Subtle background track shadow
                    float trailVal = clamp(vTrail, 0.0, 1.0);
                    if (trailVal > 0.02) {
                        float smoothTrail = smoothstep(0.10, 0.60, trailVal);
                        vec3 trailTint = baseAlbedo * vec3(0.82, 0.80, 0.86);
                        baseAlbedo = mix(baseAlbedo, trailTint, smoothTrail * 0.35);
                    }

                    // Wrap-diffuse clay shading
                    float NdotL = dot(N, L);
                    float wrap = uSoftness;
                    float diffuse = clamp((NdotL + wrap) / (1.0 + wrap), 0.0, 1.0);
                    diffuse = pow(diffuse, 1.12);

                    float backFill = clamp(dot(N, -L) * 0.5 + 0.5, 0.0, 1.0) * 0.18;
                    float edgeContactAO = smoothstep(0.12, 0.40, effectiveDirt) * (1.0 - smoothstep(0.40, 0.62, effectiveDirt));
                    float ao = (1.0 - pitFactor * 0.24) * (1.0 - edgeContactAO * 0.24);

                    // Tinted pastel shadows
                    vec3 shadowTint = baseAlbedo * vec3(0.84, 0.84, 0.98) * uShadowBrightness;
                    vec3 litColor = baseAlbedo * uLightColor * uIntensity;

                    vec3 finalColor = mix(shadowTint, litColor, diffuse);
                    finalColor += baseAlbedo * backFill * uShadowBrightness;

                    // Satin sheen on crater rim and clean surface (soft, refined clay sheen)
                    float cleanFactor = 1.0 - dirtMask;
                    float spec = pow(max(dot(N, H), 0.0), mix(12.0, 20.0, cleanFactor));
                    finalColor += uLightColor * spec * mix(0.04, 0.10, cleanFactor) * uIntensity;

                    finalColor *= ao;

                    // Fresnel rim glow
                    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.4);
                    float rimMask = smoothstep(0.15, 0.85, diffuse);
                    finalColor += uLightColor * fresnel * rimMask * 0.08 * uIntensity;

                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `
        });
    }

    public sampleCleanRadiusAt(ux: number, uy: number, uz: number): number {
        const R = Math.max(0.5, this.moonScale);
        let noise = 0;
        if (this.bumpAmt > 0) {
            noise = Math.sin(ux * (2.4 * R) + this.p1) *
                    Math.cos(uy * (2.3 * R) + this.p2) *
                    Math.sin(uz * (2.5 * R) + this.p3) * this.bumpAmt;
        }

        let craterDisp = 0;
        for (let c = 0; c < this.craters.length; c++) {
            const cr = this.craters[c];
            const dx = ux - cr.cx;
            const dy = uy - cr.cy;
            const dz = uz - cr.cz;
            const distSq = dx * dx + dy * dy + dz * dz;
            const maxRange = cr.radius * 1.65;

            if (distSq < maxRange * maxRange) {
                const dist = Math.sqrt(distSq);
                const x = dist / cr.radius;

                if (x < 1.0) {
                    const h = Math.max(0.0, 1.0 - x * x);
                    const bowl = smoothstep(0.0, 0.78, h);
                    const peak = (cr.depth > 0.028 && x < 0.28) ? (1.0 - smoothstep(0.0, 0.28, x)) * 0.22 : 0.0;
                    craterDisp -= cr.depth * Math.max(0.0, bowl - peak);
                }

                if (x > 0.58 && x < 1.65) {
                    const rimDist = Math.abs(x - 1.02);
                    const rimCurve = Math.max(0.0, 1.0 - rimDist * 3.4);
                    craterDisp += cr.depth * 0.55 * (rimCurve * rimCurve);
                }
            }
        }

        return Math.max(0.5 * R, R + noise + craterDisp);
    }

    /**
     * Fast zero-allocation lookup of dirt amount (0..1) via the spherical spatial grid.
     */
    public sampleDirtAt(ux: number, uy: number, uz: number): number {
        const len = Math.hypot(ux, uy, uz) || 1.0;
        const nx = ux / len;
        const ny = uy / len;
        const nz = uz / len;

        const R = Math.max(0.5, this.moonScale);
        const thetaInner = Math.min(1.10, 0.44 / R);
        if (ny >= Math.cos(thetaInner)) return 0;

        this._tmpSampleVec.set(nx, ny, nz);
        const nearby = this.spatialGrid.queryVerticesNear(this._tmpSampleVec, 0.032);
        if (nearby.length === 0) return 0;

        let weightedSum = 0;
        let weightTotal = 0;
        for (let k = 0; k < nearby.length; k++) {
            const vIdx = nearby[k];
            const idx = vIdx * 3;
            const dx = this.baseUnitPositions[idx] - nx;
            const dy = this.baseUnitPositions[idx + 1] - ny;
            const dz = this.baseUnitPositions[idx + 2] - nz;
            const dSq = dx * dx + dy * dy + dz * dz;
            const w = 1.0 / (dSq + 0.00005);
            weightedSum += this.dirtAmounts[vIdx] * w;
            weightTotal += w;
        }
        return weightTotal > 0 ? weightedSum / weightTotal : 0;
    }

    public sampleActualSurfaceRadiusAt(ux: number, uy: number, uz: number): number {
        const cleanR = this.sampleCleanRadiusAt(ux, uy, uz);
        const dirt = this.sampleDirtAt(ux, uy, uz);
        return cleanR + dirt * this.dirtHeight;
    }

    public applyShaderConfig(): void {
        if (!this.material || !this.material.uniforms) return;
        const cfg = ConfigManager.current;
        this.dirtHeight = cfg.dirtHeight;
        this.moonScale = cfg.moonScale;
        this.group.scale.set(1, 1, 1);

        this.material.uniforms.uSoftness.value = cfg.softness;
        this.material.uniforms.uShadowBrightness.value = cfg.shadowBrightness;
        this.material.uniforms.uIntensity.value = cfg.intensity;
        this.material.uniforms.uMoonScale.value = this.moonScale;

        // Base pad size remains constant in physical world units (~0.50) regardless of moon scale
        const R = Math.max(0.5, this.moonScale);
        const thetaOuter = Math.min(1.15, 0.50 / R);
        const thetaInner = Math.min(1.10, 0.44 / R);
        const uyOuter = Math.cos(thetaOuter);
        const uyInner = Math.cos(thetaInner);

        if (this.material.uniforms.uLandingPadY) {
            this.material.uniforms.uLandingPadY.value.set(uyOuter, uyInner);
        }

        this.updateVertexHeights();
    }

    public generateMoon(seed: number, moonLevel = 1): void {
        this.seed = seed;
        const rand = createPRNG(seed);

        // Palette selection
        this.currentPalette = MOON_PALETTES[(moonLevel - 1) % MOON_PALETTES.length];

        this.moonScale = ConfigManager.current.moonScale;
        this.dirtHeight = ConfigManager.current.dirtHeight;
        this.group.scale.set(1, 1, 1);

        // Base radius R is clamped to [0.6, 3.0] before any crater, noise, or dust generation
        const R = THREE.MathUtils.clamp(this.moonScale || 1.0, 0.60, 3.00);
        this.moonScale = R;
        if (this.material && this.material.uniforms && this.material.uniforms.uMoonScale) {
            this.material.uniforms.uMoonScale.value = R;
        }

        // Fixed physical base pad size (~0.50 world units), regardless of how large the moon is
        const thetaOuter = Math.min(1.15, 0.50 / R);
        const thetaInner = Math.min(1.10, 0.44 / R);
        const uyOuter = Math.cos(thetaOuter);
        const uyInner = Math.cos(thetaInner);

        if (this.material && this.material.uniforms && this.material.uniforms.uLandingPadY) {
            this.material.uniforms.uLandingPadY.value.set(uyOuter, uyInner);
        }

        // Scale both crater count (up to 34) and crater size with moonScale R in [0.6, 3.0]
        const normR = (R - 0.60) / 2.40; // 0.0 at 0.6, 1.0 at 3.0
        const craterCount = Math.min(34, Math.round(7 + normR * 24 + rand() * 3));
        const sizeMult = (0.76 + 0.28 * R) * (0.94 + rand() * 0.18);
        const depthMult = 0.60 + rand() * 0.24;

        this.craters = [];
        const maxAttempts = craterCount * 90;
        let attempts = 0;
        const heroQuota = Math.max(3, Math.floor(craterCount * 0.35));

        while (this.craters.length < craterCount && attempts < maxAttempts) {
            attempts++;
            // Stratified golden-angle dispersion for hero craters so they spread naturally across the globe
            let cx: number, cy: number, cz: number;
            if (this.craters.length < heroQuota) {
                const slot = this.craters.length;
                const yBase = 1.0 - 2.0 * ((slot + 0.35 + rand() * 0.30) / (heroQuota + 1.0));
                const rHoriz = Math.sqrt(Math.max(0, 1.0 - yBase * yBase));
                const goldenPhi = slot * 2.3999632 + rand() * 0.65;
                cx = rHoriz * Math.cos(goldenPhi);
                cy = yBase;
                cz = rHoriz * Math.sin(goldenPhi);
            } else {
                const u = rand();
                const v = rand();
                const theta = 2 * Math.PI * u;
                const phi = Math.acos(2 * v - 1);
                cx = Math.sin(phi) * Math.cos(theta);
                cy = Math.cos(phi);
                cz = Math.sin(phi) * Math.sin(theta);
            }

            if (cy > uyOuter - 0.05) continue;

            // Clean Hero & Medium craters only (avoids tiny trypophobia-triggering hole clusters)
            let physicalRadius: number;
            const isHero = this.craters.length < heroQuota;
            if (isHero) {
                physicalRadius = (0.24 + rand() * 0.11) * sizeMult;
            } else {
                physicalRadius = (0.14 + rand() * 0.07) * sizeMult;
            }

            const radius = Math.min(0.60, physicalRadius / R);
            const depth = (0.020 + physicalRadius * 0.12) * depthMult;

            // Generous spacing between all craters so craters never cluster tightly
            const relaxFactor = isHero ? 1.25 : 1.18;
            let overlaps = false;
            for (let j = 0; j < this.craters.length; j++) {
                const other = this.craters[j];
                const d = Math.hypot(cx - other.cx, cy - other.cy, cz - other.cz);
                if (d < (radius + other.radius) * relaxFactor) {
                    overlaps = true;
                    break;
                }
            }

            if (!overlaps) {
                this.craters.push({ cx, cy, cz, radius, depth });
            }
        }

        this.p1 = rand() * 10;
        this.p2 = rand() * 10;
        this.p3 = rand() * 10;
        this.bumpAmt = rand() * 0.010;

        const dirtAttr = this.geometry.attributes.aDirt;
        const tierAttr = this.geometry.attributes.aDirtTier;
        const trailAttr = this.geometry.attributes.aTrail;

        const dirtArr = dirtAttr.array as Float32Array;
        const tierArr = tierAttr.array as Float32Array;
        const trailArr = trailAttr.array as Float32Array;

        this.totalDirtSum = 0;

        for (let i = 0; i < this.numVerts; i++) {
            const idx = i * 3;
            const ux = this.baseUnitPositions[idx];
            const uy = this.baseUnitPositions[idx + 1];
            const uz = this.baseUnitPositions[idx + 2];

            this.cleanRadii[i] = this.sampleCleanRadiusAt(ux, uy, uz);

            if (uy >= uyInner) {
                dirtArr[i] = 0.0;
                tierArr[i] = 1.0;
            } else if (uy <= uyOuter) {
                dirtArr[i] = 1.0;
                this.totalDirtSum += 1.0;

                // Normalized distance away from base landing pad perimeter (0.0 right outside base, 1.0 at south pole)
                const distFromBase = Math.max(0.0, (uyOuter - uy) / (uyOuter + 1.0));

                // Organic procedural noise for natural winding borders between tiers
                const patchNoise = Math.sin(ux * 4.8 + this.seed) * 0.07 +
                                   Math.cos(uz * 4.8 + this.seed * 0.7) * 0.07 +
                                   Math.sin(uy * 3.6) * 0.04;

                const effectiveDist = distFromBase + patchNoise;

                // 1. Bagian awal atau dekat dengan base: Tier 1 (debu paling lemah, -10% kec, mudah dibersihkan)
                // 2. Zona menengah (lingkar ekuator): Tier 2 (debu sedang, -50% kec)
                // 3. Zona jauh (belahan belakang bulan): Tier 3 (debu tebal/pekat, -90% kec)
                if (distFromBase < 0.14 || effectiveDist < 0.30) {
                    tierArr[i] = 1.0; // Tier 1: Debu Lemah (-10% kec) - di awal & dekat base
                } else if (effectiveDist < 0.65) {
                    tierArr[i] = 2.0; // Tier 2: Debu Sedang (-50% kec)
                } else {
                    tierArr[i] = 3.0; // Tier 3: Debu Tebal/Pekat (-90% kec)
                }
            } else {
                // Smooth cubic Hermite transition band at landing pad perimeter
                const t = (uyInner - uy) / (uyInner - uyOuter);
                const smoothT = t * t * (3.0 - 2.0 * t);
                dirtArr[i] = smoothT;
                this.totalDirtSum += smoothT;

                // Tepat di batas luar base adalah Tier 1 (debu paling lemah)
                tierArr[i] = 1.0;
            }

            trailArr[i] = 0.0;
        }

        this.initialTotalDirt = this.totalDirtSum;

        dirtAttr.needsUpdate = true;
        tierAttr.needsUpdate = true;
        trailAttr.needsUpdate = true;

        // Populate 1024x512 per-pixel dirt texture for razor-sharp edges at any moonScale
        this.populateDirtTexture(uyOuter, uyInner);

        this.material.uniforms.uBaseColor.value.set(this.currentPalette.baseColor);
        this.material.uniforms.uCraterColor.value.set(this.currentPalette.craterColor);
        this.material.uniforms.uRimColor.value.set(this.currentPalette.rimColor);
        // Harmonious, natural palette dust colors (blends naturally with the lunar crust):
        this.material.uniforms.uDirtColor1.value.set(this.currentPalette.dirt1Color); // Tier 1: Debu permukaan halus (-10% kec)
        this.material.uniforms.uDirtColor2.value.set(this.currentPalette.dirt2Color); // Tier 2: Debu regolith sedang (-50% kec)
        this.material.uniforms.uDirtColor3.value.set(this.currentPalette.dirt3Color); // Tier 3: Debu pekat tebal (-90% kec)
        this.material.uniforms.uDirtHighlight.value.set(this.currentPalette.dirtHighlight);

        // Upload procedural crater data to shader uniforms (prioritizing up to 36 prominent craters)
        const sortedCraters = [...this.craters].sort((a, b) => (b.radius * b.depth) - (a.radius * a.depth));
        const activeCraterCount = Math.min(36, sortedCraters.length);
        this.material.uniforms.uCraterCount.value = activeCraterCount;
        const craterVecs = this.material.uniforms.uCraters.value as THREE.Vector4[];
        const craterDepths = this.material.uniforms.uCraterDepths.value as Float32Array;
        for (let c = 0; c < 36; c++) {
            if (c < activeCraterCount) {
                const cr = sortedCraters[c];
                craterVecs[c].set(cr.cx, cr.cy, cr.cz, cr.radius);
                craterDepths[c] = cr.depth;
            } else {
                craterVecs[c].set(0, 0, 0, 0);
                craterDepths[c] = 0;
            }
        }

        this.applyShaderConfig();
    }

    private trailUpdateFrame = 0;
    public updateTrails(dt: number): void {
        if (this.activeTrailIndices.size === 0) return;

        const cfg = ConfigManager.current;
        const duration = Math.max(1.0, cfg.trailFadeDuration || 4.5);
        const decay = dt / duration;
        const trailAttr = this.geometry.attributes.aTrail;
        const trailArr = this.trailAmounts;

        const toRemove: number[] = [];
        for (const i of this.activeTrailIndices) {
            trailArr[i] -= decay;
            if (trailArr[i] <= 0.005) {
                trailArr[i] = 0.0;
                toRemove.push(i);
            }
        }

        for (let k = 0; k < toRemove.length; k++) {
            this.activeTrailIndices.delete(toRemove[k]);
        }

        // Throttle GPU vertex buffer upload to every 2-3 frames while fading (20-30 Hz is perfectly smooth for fading trails)
        this.trailUpdateFrame++;
        if (this.trailUpdateFrame % 2 === 0 || this.activeTrailIndices.size === 0) {
            trailAttr.needsUpdate = true;
        }
    }

    /**
     * Dynamically carves a new crater on the moon surface (e.g. from a meteor impact)
     * and updates both the shader uniforms and nearby vertex heights.
     */
    public addDynamicCrater(dir: THREE.Vector3, radius: number, depth: number): void {
        const unitDir = dir.clone().normalize();
        const crater: Crater = { cx: unitDir.x, cy: unitDir.y, cz: unitDir.z, radius, depth };
        let idx = this.craters.length;
        if (idx < 36) {
            this.craters.push(crater);
            this.material.uniforms.uCraterCount.value = this.craters.length;
        } else {
            idx = 35;
            this.craters[idx] = crater;
        }

        this.material.uniforms.uCraters.value[idx].set(unitDir.x, unitDir.y, unitDir.z, radius);
        this.material.uniforms.uCraterDepths.value[idx] = depth;

        const minDot = Math.cos(Math.min(Math.PI, radius * 1.45));
        const count = this.cleanRadii.length;
        const affected: number[] = [];
        for (let i = 0; i < count; i++) {
            const nx = this.baseUnitPositions[i * 3];
            const ny = this.baseUnitPositions[i * 3 + 1];
            const nz = this.baseUnitPositions[i * 3 + 2];
            if (nx * unitDir.x + ny * unitDir.y + nz * unitDir.z >= minDot) {
                this.cleanRadii[i] = this.sampleCleanRadiusAt(nx, ny, nz);
                affected.push(i);
            }
        }
        if (affected.length > 0) {
            this.updateVertexHeightsFast(affected);
        }
    }

    public updateVertexHeightsFast(indices: number[]): void {
        const posAttr = this.geometry.attributes.position;
        const posArr = posAttr.array as Float32Array;

        for (let k = 0; k < indices.length; k++) {
            const i = indices[k];
            const idx = i * 3;
            const r = this.cleanRadii[i] + this.dirtAmounts[i] * this.dirtHeight;
            posArr[idx]     = this.baseUnitPositions[idx]     * r;
            posArr[idx + 1] = this.baseUnitPositions[idx + 1] * r;
            posArr[idx + 2] = this.baseUnitPositions[idx + 2] * r;
        }

        posAttr.needsUpdate = true;
    }

    private populateDirtTexture(uyOuter: number, uyInner: number): void {
        if (!this.renderer) return;

        this.rtInitMat.uniforms.uSeed.value = this.seed;
        this.rtInitMat.uniforms.uLandingPadY.value.set(uyOuter, uyInner);
        this.rtQuad.material = this.rtInitMat;

        const prevTarget = this.renderer.getRenderTarget();
        const prevAutoClear = this.renderer.autoClear;
        this.renderer.autoClear = false;
        this.renderer.setRenderTarget(this.readRT);
        this.renderer.render(this.rtScene, this.rtCamera);
        this.renderer.setRenderTarget(prevTarget);
        this.renderer.autoClear = prevAutoClear;

        this.material.uniforms.uDirtMap.value = this.readRT.texture;
    }

    /**
     * Paints a continuous 3D swept-roller onto the 2048x1024 GPU ping-pong RenderTarget.
     * Zero CPU texture uploads and silky-smooth high-resolution curves at any moonScale.
     */
    public paintDirtCapsule(
        p0x: number, p0y: number, p0z: number,
        p1x: number, p1y: number, p1z: number,
        fx: number, fy: number, fz: number,
        lx: number, ly: number, lz: number,
        halfWidth: number,
        halfDepth: number,
        sweepRate: number
    ): void {
        if (!this.renderer) return;

        const u = this.rtBrushMat.uniforms;
        u.uPrevDirtMap.value = this.readRT.texture;
        (u.uP0.value as THREE.Vector3).set(p0x, p0y, p0z);
        (u.uP1.value as THREE.Vector3).set(p1x, p1y, p1z);
        (u.uFwd.value as THREE.Vector3).set(fx, fy, fz);
        (u.uLeft.value as THREE.Vector3).set(lx, ly, lz);
        u.uHalfWidth.value = halfWidth;
        u.uHalfDepth.value = halfDepth;
        u.uSweepRate.value = sweepRate;

        this.rtQuad.material = this.rtBrushMat;

        const prevTarget = this.renderer.getRenderTarget();
        const prevAutoClear = this.renderer.autoClear;
        this.renderer.autoClear = false;
        this.renderer.setRenderTarget(this.writeRT);
        this.renderer.render(this.rtScene, this.rtCamera);
        this.renderer.setRenderTarget(prevTarget);
        this.renderer.autoClear = prevAutoClear;

        // Swap ping-pong buffers
        const tmp = this.readRT;
        this.readRT = this.writeRT;
        this.writeRT = tmp;

        this.material.uniforms.uDirtMap.value = this.readRT.texture;
    }

    public refillDirt(): void {
        const R = Math.max(0.5, this.moonScale);
        const thetaOuter = Math.min(1.15, 0.50 / R);
        const thetaInner = Math.min(1.10, 0.44 / R);
        const uyOuter = Math.cos(thetaOuter);
        const uyInner = Math.cos(thetaInner);

        const dirtArr = this.geometry.attributes.aDirt.array as Float32Array;
        const trailArr = this.geometry.attributes.aTrail.array as Float32Array;

        this.totalDirtSum = 0;
        for (let i = 0; i < this.numVerts; i++) {
            const uy = this.baseUnitPositions[i * 3 + 1];
            if (uy >= uyInner) {
                dirtArr[i] = 0.0;
            } else if (uy <= uyOuter) {
                dirtArr[i] = 1.0;
                this.totalDirtSum += 1.0;
            } else {
                const t = (uyInner - uy) / (uyInner - uyOuter);
                const smoothT = t * t * (3.0 - 2.0 * t);
                dirtArr[i] = smoothT;
                this.totalDirtSum += smoothT;
            }
            trailArr[i] = 0.0;
        }

        this.activeTrailIndices.clear();
        this.initialTotalDirt = this.totalDirtSum;

        this.geometry.attributes.aDirt.needsUpdate = true;
        this.geometry.attributes.aTrail.needsUpdate = true;
        this.populateDirtTexture(uyOuter, uyInner);
        this.updateVertexHeights();
    }

    public updateVertexHeights(): void {
        const posAttr = this.geometry.attributes.position;
        const posArr = posAttr.array as Float32Array;

        for (let i = 0; i < this.numVerts; i++) {
            const idx = i * 3;
            const r = this.cleanRadii[i] + this.dirtAmounts[i] * this.dirtHeight;
            posArr[idx]     = this.baseUnitPositions[idx]     * r;
            posArr[idx + 1] = this.baseUnitPositions[idx + 1] * r;
            posArr[idx + 2] = this.baseUnitPositions[idx + 2] * r;
        }

        posAttr.needsUpdate = true;
    }

    public getCleanPercentage(): number {
        if (this.initialTotalDirt <= 0) return 100;
        const cleaned = this.initialTotalDirt - this.totalDirtSum;
        return Math.max(0, Math.min(100, (cleaned / this.initialTotalDirt) * 100));
    }

    public getDustColor(tier: number): THREE.Color {
        if (tier === 3) return new THREE.Color(this.currentPalette.dirt3Color);
        if (tier === 2) return new THREE.Color(this.currentPalette.dirt2Color);
        return new THREE.Color(this.currentPalette.dirt1Color);
    }
}
