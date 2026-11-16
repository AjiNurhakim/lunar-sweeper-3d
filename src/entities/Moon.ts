import * as THREE from 'three';
import { createPRNG, smoothstep } from '../core/MathUtils';
import { DirtSpatialGrid } from '../systems/DirtSpatialGrid';
import { ConfigManager } from '../core/Config';

export interface Crater {
    cx: number;
    cy: number;
    cz: number;
    radius: number;
    depth: number;
}

export interface MoonPalette {
    name: string;
    baseColor: string;
    craterColor: string;
    rimColor: string;
    dirt1Color: string;
    dirt2Color: string;
    dirt3Color: string;
    dirtHighlight: string;
    bgPreset: string;
}

export const MOON_PALETTES: MoonPalette[] = [
    {
        name: 'Lavender',
        baseColor: '#B8B5E6',
        craterColor: '#A7A3DC',
        rimColor: '#C8C5ED',
        dirt1Color: '#6B6382',
        dirt2Color: '#4F4765',
        dirt3Color: '#2F2642',
        dirtHighlight: '#8A80A6',
        bgPreset: 'nebula'
    },
    {
        name: 'Keju Emas',
        baseColor: '#F5D061',
        craterColor: '#E2BC4E',
        rimColor: '#F9DC7F',
        dirt1Color: '#7A674D',
        dirt2Color: '#5C4B33',
        dirt3Color: '#362A19',
        dirtHighlight: '#9C8567',
        bgPreset: 'sunset'
    },
    {
        name: 'Mint Kosmik',
        baseColor: '#7CE3C3',
        craterColor: '#65CDAC',
        rimColor: '#97EBCE',
        dirt1Color: '#53706B',
        dirt2Color: '#3B5450',
        dirt3Color: '#1E3330',
        dirtHighlight: '#74948E',
        bgPreset: 'emerald'
    },
    {
        name: 'Perak Bulan',
        baseColor: '#DCE3EE',
        craterColor: '#C2CDDD',
        rimColor: '#E8EDF5',
        dirt1Color: '#687282',
        dirt2Color: '#4A5363',
        dirt3Color: '#292F3B',
        dirtHighlight: '#8B97AB',
        bgPreset: 'void'
    },
    {
        name: 'Berry Pastel',
        baseColor: '#F59BB6',
        craterColor: '#DE7E9A',
        rimColor: '#FBB6C9',
        dirt1Color: '#785567',
        dirt2Color: '#5E3B4D',
        dirt3Color: '#381C2B',
        dirtHighlight: '#9C738A',
        bgPreset: 'synthwave'
    },
    {
        name: 'Langit Biru',
        baseColor: '#8ECAE6',
        craterColor: '#6FB5D6',
        rimColor: '#A9DAF2',
        dirt1Color: '#556A7A',
        dirt2Color: '#3C4F5E',
        dirt3Color: '#20303D',
        dirtHighlight: '#768FA3',
        bgPreset: 'aurora'
    },
    {
        name: 'Crimson Mars',
        baseColor: '#E06D53',
        craterColor: '#C4543C',
        rimColor: '#F08D75',
        dirt1Color: '#6E3C32',
        dirt2Color: '#4E261E',
        dirt3Color: '#2F120B',
        dirtHighlight: '#8E5044',
        bgPreset: 'supernova'
    },
    {
        name: 'Obsidian Shadow',
        baseColor: '#3C404E',
        craterColor: '#2D303C',
        rimColor: '#525769',
        dirt1Color: '#23252E',
        dirt2Color: '#181A20',
        dirt3Color: '#0E0F13',
        dirtHighlight: '#5C6275',
        bgPreset: 'blackhole'
    },
    {
        name: 'Zamrud Tropis',
        baseColor: '#48BF84',
        craterColor: '#36A36E',
        rimColor: '#6BD4A0',
        dirt1Color: '#2D5943',
        dirt2Color: '#1E3D2E',
        dirt3Color: '#10241A',
        dirtHighlight: '#3F785C',
        bgPreset: 'emerald'
    },
    {
        name: 'Sakura Blossom',
        baseColor: '#F7A8B8',
        craterColor: '#DE8B9C',
        rimColor: '#FFC2CE',
        dirt1Color: '#7A4D57',
        dirt2Color: '#5C343D',
        dirt3Color: '#381C22',
        dirtHighlight: '#996370',
        bgPreset: 'synthwave'
    },
    {
        name: 'Glacial Arctica',
        baseColor: '#E2F1F8',
        craterColor: '#C5DFEC',
        rimColor: '#F0F8FD',
        dirt1Color: '#577180',
        dirt2Color: '#3E5360',
        dirt3Color: '#23323B',
        dirtHighlight: '#7B9AA9',
        bgPreset: 'comet'
    },
    {
        name: 'Matahari Senja',
        baseColor: '#F9844A',
        craterColor: '#DE6B33',
        rimColor: '#FFA372',
        dirt1Color: '#78432C',
        dirt2Color: '#582E1C',
        dirt3Color: '#33170B',
        dirtHighlight: '#9E5B3E',
        bgPreset: 'sunset'
    },
    {
        name: 'Samudra Dalam',
        baseColor: '#4D7EA8',
        craterColor: '#3B688F',
        rimColor: '#6C9BC2',
        dirt1Color: '#2C4357',
        dirt2Color: '#1D2E3D',
        dirt3Color: '#0E1720',
        dirtHighlight: '#44627A',
        bgPreset: 'void'
    },
    {
        name: 'Amethyst Kristal',
        baseColor: '#9D65C9',
        craterColor: '#844EB0',
        rimColor: '#B684DD',
        dirt1Color: '#52346A',
        dirt2Color: '#3A224D',
        dirt3Color: '#20112D',
        dirtHighlight: '#724D90',
        bgPreset: 'nebula'
    },
    {
        name: 'Matcha Moss',
        baseColor: '#A3B18A',
        craterColor: '#8C9A74',
        rimColor: '#BDCCA4',
        dirt1Color: '#515B44',
        dirt2Color: '#394030',
        dirt3Color: '#21261B',
        dirtHighlight: '#6F7B5E',
        bgPreset: 'emerald'
    },
    {
        name: 'Tembaga Kuno',
        baseColor: '#DDA15E',
        craterColor: '#C48847',
        rimColor: '#EDB87B',
        dirt1Color: '#6B4D2F',
        dirt2Color: '#4D341D',
        dirt3Color: '#2B1C0D',
        dirtHighlight: '#8E6741',
        bgPreset: 'asteroid'
    },
    {
        name: 'Neon Cyberpunk',
        baseColor: '#795290',
        craterColor: '#613C77',
        rimColor: '#966EAD',
        dirt1Color: '#422852',
        dirt2Color: '#2C1838',
        dirt3Color: '#170A20',
        dirtHighlight: '#5C3C6F',
        bgPreset: 'synthwave'
    },
    {
        name: 'Batu Asteroid',
        baseColor: '#8D99AE',
        craterColor: '#758094',
        rimColor: '#A6B2C6',
        dirt1Color: '#454C59',
        dirt2Color: '#303540',
        dirt3Color: '#1B1E24',
        dirtHighlight: '#5F6878',
        bgPreset: 'asteroid'
    },
    {
        name: 'Gurun Sahara',
        baseColor: '#E9C46A',
        craterColor: '#D1AC52',
        rimColor: '#F4D78B',
        dirt1Color: '#735F36',
        dirt2Color: '#524323',
        dirt3Color: '#2E2411',
        dirtHighlight: '#967E4D',
        bgPreset: 'sunset'
    },
    {
        name: 'Toska Tropis',
        baseColor: '#52B2CF',
        craterColor: '#3F99B5',
        rimColor: '#72CBE6',
        dirt1Color: '#325C6B',
        dirt2Color: '#203E4A',
        dirt3Color: '#102229',
        dirtHighlight: '#477C8E',
        bgPreset: 'aurora'
    },
    {
        name: 'Kopi Karamel',
        baseColor: '#C89666',
        craterColor: '#B07E4F',
        rimColor: '#DFB083',
        dirt1Color: '#61442B',
        dirt2Color: '#442E1B',
        dirt3Color: '#25170B',
        dirtHighlight: '#835E3E',
        bgPreset: 'asteroid'
    },
    {
        name: 'Koral Cerah',
        baseColor: '#F28482',
        craterColor: '#DA6D6B',
        rimColor: '#F7A4A3',
        dirt1Color: '#753F3E',
        dirt2Color: '#542928',
        dirt3Color: '#301312',
        dirtHighlight: '#9C5857',
        bgPreset: 'supernova'
    },
    {
        name: 'Mutiara Polar',
        baseColor: '#EAE6E1',
        craterColor: '#D1CDC7',
        rimColor: '#FAF7F3',
        dirt1Color: '#69645E',
        dirt2Color: '#4A4641',
        dirt3Color: '#2A2723',
        dirtHighlight: '#8E8880',
        bgPreset: 'comet'
    },
    {
        name: 'Indigo Nebula',
        baseColor: '#5C6B9E',
        craterColor: '#475585',
        rimColor: '#7786B9',
        dirt1Color: '#323C5E',
        dirt2Color: '#212942',
        dirt3Color: '#111526',
        dirtHighlight: '#4B5780',
        bgPreset: 'void'
    }
];

export class Moon {
    public group: THREE.Group;
    public mesh!: THREE.Mesh;
    public geometry!: THREE.BufferGeometry;
    public material!: THREE.ShaderMaterial;

    public baseUnitPositions!: Float32Array;
    public cleanRadii!: Float32Array;
    public cleanColors!: Float32Array;
    public dirtAmounts!: Float32Array;
    public dirtTiers!: Float32Array;
    public trailAmounts!: Float32Array;
    public activeTrailIndices: Set<number> = new Set();

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

    constructor(scene: THREE.Scene) {
        this.group = new THREE.Group();
        scene.add(this.group);
        this.spatialGrid = new DirtSpatialGrid(36, 72);

        this.initGeometry(7); // Detail 7 (81,920 vertices for high-precision silky smooth paths)
        this.initMaterial();
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.group.add(this.mesh);
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
        const colors = new Float32Array(this.numVerts * 3);
        const cavities = new Float32Array(this.numVerts);
        this.dirtAmounts = new Float32Array(this.numVerts);
        this.dirtTiers = new Float32Array(this.numVerts);
        this.trailAmounts = new Float32Array(this.numVerts);

        this.cleanRadii = new Float32Array(this.numVerts);
        this.cleanColors = new Float32Array(this.numVerts * 3);

        for (let i = 0; i < this.numVerts; i++) {
            const idx = i * 3;
            this.baseUnitPositions[idx]     = verts[i][0];
            this.baseUnitPositions[idx + 1] = verts[i][1];
            this.baseUnitPositions[idx + 2] = verts[i][2];

            positions[idx]     = verts[i][0];
            positions[idx + 1] = verts[i][1];
            positions[idx + 2] = verts[i][2];
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
        this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.geometry.setAttribute('aCavity', new THREE.BufferAttribute(cavities, 1));
        this.geometry.setAttribute('aDirt', new THREE.BufferAttribute(this.dirtAmounts, 1));
        this.geometry.setAttribute('aDirtTier', new THREE.BufferAttribute(this.dirtTiers, 1));
        this.geometry.setAttribute('aTrail', new THREE.BufferAttribute(this.trailAmounts, 1));
        this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));

        this.spatialGrid.buildGrid(this.baseUnitPositions, this.numVerts);
    }

    private initMaterial(): void {
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uLightDir: { value: new THREE.Vector3(-0.55, 0.56, 0.62).normalize() },
                uLightColor: { value: new THREE.Color('#FFFDF7') },
                uBaseColor: { value: new THREE.Color('#B8B5E6') },
                uCraterColor: { value: new THREE.Color('#9590D0') },
                uRimColor: { value: new THREE.Color('#DAD7FA') },
                uDirtColor1: { value: new THREE.Color('#6B6382') },
                uDirtColor2: { value: new THREE.Color('#4F4765') },
                uDirtColor3: { value: new THREE.Color('#2F2642') },
                uDirtHighlight: { value: new THREE.Color('#8A80A6') },
                uIntensity: { value: 1.15 },
                uShadowBrightness: { value: 0.48 },
                uSoftness: { value: 0.55 },
                uCraterCount: { value: 0 },
                uCraters: { value: Array.from({ length: 24 }, () => new THREE.Vector4(0, 0, 0, 0)) },
                uCraterDepths: { value: new Float32Array(24) }
            },
            vertexShader: `
                attribute vec3 color;
                attribute float aCavity;
                attribute float aDirt;
                attribute float aDirtTier;
                attribute float aTrail;

                varying vec3 vNormalWorld;
                varying vec3 vViewDirWorld;
                varying vec3 vLocalDir;
                varying float vDirt;
                varying float vDirtTier;
                varying float vTrail;

                void main() {
                    vDirt = aDirt;
                    vDirtTier = aDirtTier;
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
                uniform vec4 uCraters[24];
                uniform float uCraterDepths[24];

                varying vec3 vNormalWorld;
                varying vec3 vViewDirWorld;
                varying vec3 vLocalDir;
                varying float vDirt;
                varying float vDirtTier;
                varying float vTrail;

                // High-performance smooth 3D continuous noise
                float hash3D(vec3 p) {
                    p = fract(p * 0.3183099 + 0.1);
                    p *= 17.0;
                    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
                }

                float smoothNoise3D(vec3 p) {
                    vec3 i = floor(p);
                    vec3 f = fract(p);
                    vec3 u = f * f * (3.0 - 2.0 * f); // Cubic hermite curve

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

                void main() {
                    vec3 dir = normalize(vLocalDir);
                    vec3 N = normalize(vNormalWorld);
                    vec3 L = normalize(uLightDir);
                    vec3 V = normalize(vViewDirWorld);
                    vec3 H = normalize(L + V);

                    // 1. Procedural Smooth Crater Evaluation (Per-Pixel Exact Circles & Soft Bowls)
                    float pitFactor = 0.0;
                    float rimFactor = 0.0;
                    vec3 craterSlopeVec = vec3(0.0);

                    for (int c = 0; c < 24; c++) {
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
                            float x = dist / cRad;

                            // Smooth bowl depression
                            if (x < 1.0) {
                                float bowl = pow(0.5 * (1.0 + cos(3.14159265 * x)), 1.5);
                                pitFactor = max(pitFactor, bowl);

                                // Analytical derivative for lighting normal curvature
                                float slopeMag = -1.5 * pow(0.5 * (1.0 + cos(3.14159265 * x)), 0.5) * 0.5 * sin(3.14159265 * x) * (3.14159265 / cRad) * cDepth;
                                craterSlopeVec += (diff / max(dist, 0.0001)) * slopeMag;
                            }

                            // Circular raised rim (100% mathematically circular, zero hexagon faceting!)
                            if (x > 0.50 && x < 1.65) {
                                float rimNorm = (x - 1.04) / 0.26;
                                float rimBell = exp(-(rimNorm * rimNorm));
                                float rimMask = smoothstep(0.50, 0.92, x) * (1.0 - smoothstep(1.18, 1.65, x));
                                float rimCurve = rimBell * rimMask;
                                rimFactor = max(rimFactor, rimCurve);

                                // Outward rim slope bevel
                                float dRim = -2.0 * rimNorm * (1.0 / 0.26) * rimBell * rimMask * (1.0 / cRad) * cDepth * 0.46;
                                craterSlopeVec += (diff / max(dist, 0.0001)) * dRim;
                            }
                        }
                    }

                    // Smoothly curve normal using analytical crater gradient
                    N = normalize(N - craterSlopeVec * 0.82);

                    // Calculate clean moon surface color per pixel (subtle, soft crater depth & gentle rim highlight)
                    vec3 cleanColor = uBaseColor;
                    if (pitFactor > 0.005) {
                        float smoothPit = smoothstep(0.0, 0.95, pitFactor);
                        cleanColor = mix(cleanColor, uCraterColor, min(0.38, smoothPit * 0.35));
                    }
                    if (rimFactor > 0.01 && pitFactor < 0.25) {
                        cleanColor = mix(cleanColor, uRimColor, min(0.26, rimFactor * 0.24));
                    }

                    // 2. Multi-tier dirt color blending
                    vec3 baseDirt = uDirtColor1;
                    if (vDirtTier > 2.5) {
                        baseDirt = uDirtColor3;
                    } else if (vDirtTier > 1.5) {
                        baseDirt = uDirtColor2;
                    }

                    // Smoothly darken craters on the dirty layer using per-pixel pitFactor (gentle subtle ambient depth)
                    if (pitFactor > 0.05) {
                        baseDirt = mix(baseDirt, uDirtColor3, smoothstep(0.05, 0.70, pitFactor) * 0.40);
                    }

                    // Soft organic procedural dust texture without sharp pixel blocks
                    float grain1 = smoothNoise3D(dir * 85.0);
                    float grain2 = smoothNoise3D(dir * 160.0);
                    float organicDustGrain = grain1 * 0.65 + grain2 * 0.35;
                    vec3 dustySurface = mix(baseDirt, uDirtHighlight, organicDustGrain * 0.35);

                    // Procedural North Pole Landing Pad (Rocket Base circular zone)
                    // Mathematically exact circular perimeter with anti-aliasing (eliminates polygon stepping!)
                    float landingPadClean = smoothstep(0.852, 0.878, dir.y);
                    float effectiveDirt = vDirt * (1.0 - landingPadClean);

                    // Silky-smooth anti-aliased continuous dirt mask transition (wide cubic Hermite band)
                    float dirtMask = smoothstep(0.04, 0.55, effectiveDirt);

                    // Soft rounded clay edge highlight at the border of the sweep and landing pad
                    float edgeGlow = smoothstep(0.03, 0.22, effectiveDirt) * (1.0 - smoothstep(0.22, 0.52, effectiveDirt));
                    dustySurface += vec3(0.08, 0.07, 0.06) * edgeGlow;

                    vec3 baseAlbedo = mix(cleanColor, dustySurface, dirtMask);

                    // 3. Smooth tire trails (fading, soft tint)
                    float trailVal = clamp(vTrail, 0.0, 1.0);
                    float smoothTrail = smoothstep(0.05, 0.55, trailVal);
                    vec3 trailTint = baseAlbedo * vec3(0.72, 0.70, 0.78);
                    baseAlbedo = mix(baseAlbedo, trailTint, smoothTrail * 0.65);

                    // Wrap-diffuse clay shading
                    float NdotL = dot(N, L);
                    float wrap = uSoftness;
                    float diffuse = clamp((NdotL + wrap) / (1.0 + wrap), 0.0, 1.0);
                    diffuse = pow(diffuse, 1.12);

                    float backFill = clamp(dot(N, -L) * 0.5 + 0.5, 0.0, 1.0) * 0.18;
                    float ao = 1.0 - pitFactor * 0.24;

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
        let noise = 0;
        if (this.bumpAmt > 0) {
            noise = Math.sin(ux * 2.4 + this.p1) *
                    Math.cos(uy * 2.3 + this.p2) *
                    Math.sin(uz * 2.5 + this.p3) * this.bumpAmt;
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
                    const bowl = Math.pow(0.5 * (1.0 + Math.cos(Math.PI * x)), 1.5);
                    craterDisp -= cr.depth * bowl;
                }

                if (x > 0.50 && x < 1.65) {
                    const rimNorm = (x - 1.04) / 0.26;
                    const rimBell = Math.exp(-(rimNorm * rimNorm));
                    const rimMask = smoothstep(0.50, 0.92, x) * (1.0 - smoothstep(1.18, 1.65, x));
                    craterDisp += cr.depth * 0.46 * rimBell * rimMask;
                }
            }
        }

        return Math.max(0.5, 1.0 + noise + craterDisp);
    }

    public sampleActualSurfaceRadiusAt(ux: number, uy: number, uz: number): number {
        const cleanR = this.sampleCleanRadiusAt(ux, uy, uz);
        const nearby = this.spatialGrid.queryVerticesNear(new THREE.Vector3(ux, uy, uz), 0.08);
        let dirt = 0;
        if (nearby.length > 0) {
            let total = 0;
            for (let k = 0; k < nearby.length; k++) {
                total += this.dirtAmounts[nearby[k]];
            }
            dirt = total / nearby.length;
        }
        return cleanR + dirt * this.dirtHeight;
    }

    public applyShaderConfig(): void {
        if (!this.material || !this.material.uniforms) return;
        const cfg = ConfigManager.current;
        this.dirtHeight = cfg.dirtHeight;
        this.moonScale = cfg.moonScale;
        this.group.scale.setScalar(this.moonScale);

        this.material.uniforms.uSoftness.value = cfg.softness;
        this.material.uniforms.uShadowBrightness.value = cfg.shadowBrightness;
        this.material.uniforms.uIntensity.value = cfg.intensity;
        this.updateVertexHeights();
    }

    public generateMoon(seed: number, moonLevel = 1): void {
        this.seed = seed;
        const rand = createPRNG(seed);

        // Palette selection
        this.currentPalette = MOON_PALETTES[(moonLevel - 1) % MOON_PALETTES.length];

        this.moonScale = ConfigManager.current.moonScale;
        this.dirtHeight = ConfigManager.current.dirtHeight;
        this.group.scale.setScalar(this.moonScale);

        const craterCount = Math.floor(12 + rand() * 12 + Math.min(8, moonLevel * 1.5));
        const sizeMult = 0.95 + rand() * 0.45;
        const depthMult = 0.48 + rand() * 0.26;

        this.craters = [];
        const maxAttempts = craterCount * 75;
        let attempts = 0;

        while (this.craters.length < craterCount && attempts < maxAttempts) {
            attempts++;
            const u = rand();
            const v = rand();
            const theta = 2 * Math.PI * u;
            const phi = Math.acos(2 * v - 1);

            const cx = Math.sin(phi) * Math.cos(theta);
            const cy = Math.cos(phi);
            const cz = Math.sin(phi) * Math.sin(theta);

            if (cy > 0.85) continue;

            let baseRadius: number;
            const heroQuota = Math.max(2, Math.floor(craterCount * 0.25));
            if (this.craters.length < heroQuota) {
                baseRadius = 0.20 + rand() * 0.06;
            } else if (rand() < 0.5) {
                baseRadius = 0.13 + rand() * 0.05;
            } else {
                baseRadius = 0.08 + rand() * 0.04;
            }

            const radius = baseRadius * sizeMult;
            const depth = (0.030 + baseRadius * 0.23) * depthMult;

            const relaxFactor = attempts > maxAttempts * 0.7 ? 0.84 : 1.08;
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
        this.bumpAmt = rand() * 0.012;

        const colAttr = this.geometry.attributes.color;
        const cavAttr = this.geometry.attributes.aCavity;
        const dirtAttr = this.geometry.attributes.aDirt;
        const tierAttr = this.geometry.attributes.aDirtTier;
        const trailAttr = this.geometry.attributes.aTrail;

        const colArr = colAttr.array as Float32Array;
        const cavArr = cavAttr.array as Float32Array;
        const dirtArr = dirtAttr.array as Float32Array;
        const tierArr = tierAttr.array as Float32Array;
        const trailArr = trailAttr.array as Float32Array;

        const cBase = new THREE.Color(this.currentPalette.baseColor);
        const cCrater = new THREE.Color(this.currentPalette.craterColor);
        const cRim = new THREE.Color(this.currentPalette.rimColor);
        const tempCol = new THREE.Color();

        this.totalDirtSum = 0;

        for (let i = 0; i < this.numVerts; i++) {
            const idx = i * 3;
            const ux = this.baseUnitPositions[idx];
            const uy = this.baseUnitPositions[idx + 1];
            const uz = this.baseUnitPositions[idx + 2];

            let noise = 0;
            if (this.bumpAmt > 0) {
                noise = Math.sin(ux * 2.4 + this.p1) *
                        Math.cos(uy * 2.3 + this.p2) *
                        Math.sin(uz * 2.5 + this.p3) * this.bumpAmt;
            }

            let craterDisp = 0;
            let pitFactor = 0;
            let rimFactor = 0;

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
                        const bowl = Math.pow(0.5 * (1.0 + Math.cos(Math.PI * x)), 1.5);
                        craterDisp -= cr.depth * bowl;
                        pitFactor = Math.max(pitFactor, bowl);
                    }

                    if (x > 0.50 && x < 1.65) {
                        const rimNorm = (x - 1.04) / 0.26;
                        const rimBell = Math.exp(-(rimNorm * rimNorm));
                        const rimMask = smoothstep(0.50, 0.92, x) * (1.0 - smoothstep(1.18, 1.65, x));
                        const rimCurve = rimBell * rimMask;

                        craterDisp += cr.depth * 0.46 * rimCurve;
                        rimFactor = Math.max(rimFactor, rimCurve * Math.min(1, depthMult * 1.6));
                    }
                }
            }

            this.cleanRadii[i] = Math.max(0.5, 1.0 + noise + craterDisp);
            cavArr[i] = pitFactor;

            tempCol.copy(cBase);
            if (pitFactor > 0.005) {
                const smoothPit = smoothstep(0.0, 0.95, pitFactor);
                tempCol.lerp(cCrater, Math.min(0.68, smoothPit * 0.64));
            }
            if (rimFactor > 0.01 && pitFactor < 0.25) {
                tempCol.lerp(cRim, Math.min(0.58, rimFactor * 0.50));
            }

            this.cleanColors[idx]     = tempCol.r;
            this.cleanColors[idx + 1] = tempCol.g;
            this.cleanColors[idx + 2] = tempCol.b;

            colArr[idx]     = tempCol.r;
            colArr[idx + 1] = tempCol.g;
            colArr[idx + 2] = tempCol.b;

            if (uy >= 0.880) {
                dirtArr[i] = 0.0;
                tierArr[i] = 1.0;
            } else if (uy <= 0.852) {
                dirtArr[i] = 1.0;
                this.totalDirtSum += 1.0;

                const tierNoise = Math.sin(ux * 4.2 + 1.5) * Math.cos(uz * 4.2 + 2.7);
                if (tierNoise > 0.35) {
                    tierArr[i] = 3.0;
                } else if (tierNoise > -0.2) {
                    tierArr[i] = 2.0;
                } else {
                    tierArr[i] = 1.0;
                }
            } else {
                // Smooth cubic Hermite transition band at landing pad perimeter (0.852 to 0.880)
                const t = (0.880 - uy) / (0.880 - 0.852);
                const smoothT = t * t * (3.0 - 2.0 * t);
                dirtArr[i] = smoothT;
                this.totalDirtSum += smoothT;
                tierArr[i] = 1.0;
            }

            trailArr[i] = 0.0;
        }

        this.initialTotalDirt = this.totalDirtSum;

        colAttr.needsUpdate = true;
        cavAttr.needsUpdate = true;
        dirtAttr.needsUpdate = true;
        tierAttr.needsUpdate = true;
        trailAttr.needsUpdate = true;

        this.material.uniforms.uBaseColor.value.set(this.currentPalette.baseColor);
        this.material.uniforms.uCraterColor.value.set(this.currentPalette.craterColor);
        this.material.uniforms.uRimColor.value.set(this.currentPalette.rimColor);
        this.material.uniforms.uDirtColor1.value.set(this.currentPalette.dirt1Color);
        this.material.uniforms.uDirtColor2.value.set(this.currentPalette.dirt2Color);
        this.material.uniforms.uDirtColor3.value.set(this.currentPalette.dirt3Color);
        this.material.uniforms.uDirtHighlight.value.set(this.currentPalette.dirtHighlight);

        // Upload procedural crater data to shader uniforms
        const activeCraterCount = Math.min(24, this.craters.length);
        this.material.uniforms.uCraterCount.value = activeCraterCount;
        const craterVecs = this.material.uniforms.uCraters.value as THREE.Vector4[];
        const craterDepths = this.material.uniforms.uCraterDepths.value as Float32Array;
        for (let c = 0; c < 24; c++) {
            if (c < activeCraterCount) {
                const cr = this.craters[c];
                craterVecs[c].set(cr.cx, cr.cy, cr.cz, cr.radius);
                craterDepths[c] = cr.depth;
            } else {
                craterVecs[c].set(0, 0, 0, 0);
                craterDepths[c] = 0;
            }
        }

        this.applyShaderConfig();
    }

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

        trailAttr.needsUpdate = true;
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

    public refillDirt(): void {
        const dirtArr = this.geometry.attributes.aDirt.array as Float32Array;
        const trailArr = this.geometry.attributes.aTrail.array as Float32Array;

        dirtArr.fill(1.0);
        trailArr.fill(0.0);
        this.activeTrailIndices.clear();
        this.totalDirtSum = this.numVerts;
        this.initialTotalDirt = this.numVerts;

        this.geometry.attributes.aDirt.needsUpdate = true;
        this.geometry.attributes.aTrail.needsUpdate = true;
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
        this.geometry.computeVertexNormals();
    }

    public getCleanPercentage(): number {
        if (this.initialTotalDirt <= 0) return 100;
        const cleaned = this.initialTotalDirt - this.totalDirtSum;
        return Math.max(0, Math.min(100, (cleaned / this.initialTotalDirt) * 100));
    }
}
