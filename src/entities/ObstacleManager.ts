import * as THREE from 'three';
import { Moon } from './Moon';
import { createPRNG } from '../core/MathUtils';
import { attachOutline } from '../core/OutlineUtils';

export interface MoonRock {
    mesh: THREE.Mesh;
    dir: THREE.Vector3;       // Unit direction on moon sphere
    basePos: THREE.Vector3;   // Resting world/moon-local position
    baseQuat: THREE.Quaternion;
    color: THREE.Color;
    collisionRadius: number;  // World-space horizontal bounding radius
    height: number;
    tier: 1 | 2 | 3;
    isGolden?: boolean;
    hp: number;
    maxHp: number;
    hitShake: number;         // 0..1 decaying impact vibration
    crackUniform: { value: number };
    hpBgSprite: THREE.Sprite;
    hpFillSprite: THREE.Sprite;
    hpFillMat: THREE.SpriteMaterial;
    hpBarOffset: number;
    hpBarTimer: number;
}

interface RockDebris {
    active: boolean;
    mesh: THREE.Mesh;
    mat: THREE.MeshStandardMaterial;
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    upDir: THREE.Vector3;
    rotVel: THREE.Vector3;
    groundR: number;
    life: number;
    maxLife: number;
    baseScale: number;
}

/**
 * Generates and manages destructible stylized low-poly boulders on the moon surface.
 * - Flat bottom seated on lunar bedrock, organic sculpted top
 * - Tiered health & progressive shader cracks on hammer hits
 * - Outlined rock debris chunks affected by spherical lunar gravity that shrink & vanish
 */
export class ObstacleManager {
    public group: THREE.Group;
    public rocks: MoonRock[] = [];
    private moon: Moon;

    // Pooled outlined rock debris chunks (zero runtime geometry/material allocs)
    private debrisPool: RockDebris[] = [];
    private debrisCursor = 0;
    private readonly MAX_DEBRIS = 44;

    // Shared health-bar background material & color scratch
    private hpBgMat = new THREE.SpriteMaterial({
        color: '#09090B',
        depthTest: true,
        depthWrite: false
    });
    private _hpGreen = new THREE.Color('#22C55E');
    private _hpYellow = new THREE.Color('#EAB308');
    private _hpRed = new THREE.Color('#EF4444');

    // Reusable scratch vectors for zero-GC math
    private _tmpPushDir = new THREE.Vector3();
    private _tmpVelDir = new THREE.Vector3();
    private _tmpSlopeNormal = new THREE.Vector3();
    private _tmpTangentA = new THREE.Vector3();
    private _tmpTangentB = new THREE.Vector3();
    private _tmpQuat = new THREE.Quaternion();
    private _tmpYawQuat = new THREE.Quaternion();
    private _upAxis = new THREE.Vector3(0, 1, 0);
    private _tmpSensorDir = new THREE.Vector3();
    private _tmpHitPos = new THREE.Vector3();
    private _tmpVel = new THREE.Vector3();

    constructor(moon: Moon) {
        this.moon = moon;
        this.group = new THREE.Group();
        this.moon.group.add(this.group);
        this.initDebrisPool();
    }

    private initDebrisPool(): void {
        const chunkGeom = new THREE.DodecahedronGeometry(0.013, 0);
        for (let i = 0; i < this.MAX_DEBRIS; i++) {
            const mat = new THREE.MeshStandardMaterial({
                color: '#818B98',
                roughness: 0.88,
                metalness: 0.04,
                flatShading: true
            });
            const mesh = new THREE.Mesh(chunkGeom, mat);
            attachOutline(mesh, { width: 0.0022, color: '#09090B' });
            mesh.visible = false;
            this.group.add(mesh);

            this.debrisPool.push({
                active: false,
                mesh,
                mat,
                pos: new THREE.Vector3(),
                vel: new THREE.Vector3(),
                upDir: new THREE.Vector3(0, 1, 0),
                rotVel: new THREE.Vector3(),
                groundR: 1.0,
                life: 0,
                maxLife: 0.8,
                baseScale: 1.0
            });
        }
    }

    public clear(): void {
        for (const rock of this.rocks) {
            if (rock.mesh.geometry) rock.mesh.geometry.dispose();
            if (rock.mesh.material) {
                const mats = Array.isArray(rock.mesh.material) ? rock.mesh.material : [rock.mesh.material];
                for (const m of mats) m.dispose();
            }
            this.group.remove(rock.mesh);
            rock.hpFillMat.dispose();
            this.group.remove(rock.hpBgSprite);
            this.group.remove(rock.hpFillSprite);
        }
        this.rocks = [];

        for (const d of this.debrisPool) {
            d.active = false;
            d.mesh.visible = false;
        }
    }

    public generateRocks(seed: number, moonLevel = 1): void {
        this.clear();

        const R = Math.max(0.5, this.moon.moonScale);
        const rand = createPRNG(seed + 4242);

        const thetaOuter = Math.min(1.15, 0.50 / R);
        const uyOuter = Math.cos(thetaOuter);
        const safeMaxUy = uyOuter - 0.18 / R;

        const areaFactor = Math.min(4.0, 0.40 + 0.60 * R * R);
        const targetCount = Math.floor((10 + rand() * 5 + Math.min(6, moonLevel * 0.8)) * areaFactor);
        const maxAttempts = targetCount * 60;
        let attempts = 0;

        const palette = this.moon.currentPalette;
        const cDirt1 = new THREE.Color(palette.dirt1Color);
        const cDirt2 = new THREE.Color(palette.dirt2Color);
        const cDirt3 = new THREE.Color(palette.dirt3Color);

        while (this.rocks.length < targetCount && attempts < maxAttempts) {
            attempts++;
            const u = rand();
            const v = rand();
            const theta = 2 * Math.PI * u;
            const phi = Math.acos(2 * v - 1);

            const cx = Math.sin(phi) * Math.cos(theta);
            const cy = Math.cos(phi);
            const cz = Math.sin(phi) * Math.sin(theta);

            if (cy > safeMaxUy) continue;

            const baseRadius = 0.052 + rand() * 0.045;
            const stretchX = 0.88 + rand() * 0.28;
            const stretchZ = 0.88 + rand() * 0.28;
            const maxHorizRadius = baseRadius * Math.max(stretchX, stretchZ);
            const heightY = baseRadius * (0.76 + rand() * 0.42);

            const minWorldGap = 0.26;
            let tooClose = false;
            for (let j = 0; j < this.rocks.length; j++) {
                const other = this.rocks[j];
                const chordDist = Math.hypot(
                    cx - other.dir.x,
                    cy - other.dir.y,
                    cz - other.dir.z
                ) * R;
                if (chordDist < maxHorizRadius + other.collisionRadius + minWorldGap) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) continue;

            const distFromBase = Math.max(0.0, (uyOuter - cy) / (uyOuter + 1.0));
            const patchNoise = Math.sin(cx * 4.8 + this.moon.seed) * 0.07 +
                               Math.cos(cz * 4.8 + this.moon.seed * 0.7) * 0.07 +
                               Math.sin(cy * 3.6) * 0.04;
            const effectiveDist = distFromBase + patchNoise;

            let tier: 1 | 2 | 3 = 1;
            const rockColor = new THREE.Color();
            if (distFromBase < 0.14 || effectiveDist < 0.30) {
                tier = 1;
                rockColor.copy(cDirt1);
            } else if (effectiveDist < 0.65) {
                tier = 2;
                rockColor.copy(cDirt2);
            } else {
                tier = 3;
                rockColor.copy(cDirt3);
            }

            rockColor.offsetHSL(0, 0, -0.02 + (rand() - 0.5) * 0.03);

            const tierScale = tier === 3 ? 1.18 : (tier === 2 ? 1.08 : 1.0);
            const finalRadX = baseRadius * stretchX * tierScale;
            const finalRadZ = baseRadius * stretchZ * tierScale;
            const finalHeightY = heightY * tierScale;

            const geom = this.createOrganicRockGeometry(
                seed + attempts * 37,
                finalRadX,
                finalRadZ,
                finalHeightY
            );

            const crackUniform = { value: 0.0 };
            const mat = new THREE.MeshStandardMaterial({
                color: rockColor,
                roughness: 0.88,
                metalness: 0.04,
                flatShading: true
            });
            mat.onBeforeCompile = (shader) => {
                shader.uniforms.uCrackAmount = crackUniform;
                shader.vertexShader = `
                    varying vec3 vRockLocalPos;
                ` + shader.vertexShader;
                shader.vertexShader = shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    `
                    #include <begin_vertex>
                    vRockLocalPos = position;
                    `
                );
                shader.fragmentShader = `
                    uniform float uCrackAmount;
                    varying vec3 vRockLocalPos;

                    vec3 hash33Rock(vec3 p3) {
                        p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
                        p3 += dot(p3, p3.yxz + 33.33);
                        return fract((p3.xxy + p3.yxx) * p3.zyx);
                    }

                    float voronoiCrack(vec3 x) {
                        vec3 n = floor(x);
                        vec3 f = fract(x);
                        float d1 = 8.0;
                        float d2 = 8.0;
                        for (int k = -1; k <= 1; k++) {
                            for (int j = -1; j <= 1; j++) {
                                for (int i = -1; i <= 1; i++) {
                                    vec3 g = vec3(float(i), float(j), float(k));
                                    vec3 o = hash33Rock(n + g);
                                    vec3 r = g + o - f;
                                    float d = dot(r, r);
                                    if (d < d1) {
                                        d2 = d1;
                                        d1 = d;
                                    } else if (d < d2) {
                                        d2 = d;
                                    }
                                }
                            }
                        }
                        return sqrt(d2) - sqrt(d1);
                    }

                    float evalRockCracks(vec3 p) {
                        return voronoiCrack(p * 8.0 + vec3(1.3, 2.7, 0.9));
                    }
                ` + shader.fragmentShader;
                shader.fragmentShader = shader.fragmentShader.replace(
                    '#include <color_fragment>',
                    `
                    #include <color_fragment>
                    if (uCrackAmount > 0.01) {
                        float cVal = evalRockCracks(vRockLocalPos);
                        float thresh = uCrackAmount * 0.082;
                        float crackMask = 1.0 - smoothstep(thresh, thresh + 0.004, cVal);
                        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.028, 0.04), crackMask * 0.95);
                    }
                    `
                );
            };

            const mesh = new THREE.Mesh(geom, mat);
            attachOutline(mesh, { width: 0.0024 });

            const dir = new THREE.Vector3(cx, cy, cz).normalize();
            const cleanR = this.moon.sampleCleanRadiusAt(cx, cy, cz);

            const eps = 0.03 / R;
            this._tmpTangentA.set(Math.abs(cy) < 0.9 ? 0 : 1, Math.abs(cy) < 0.9 ? 1 : 0, 0).cross(dir).normalize();
            this._tmpTangentB.crossVectors(dir, this._tmpTangentA).normalize();

            const rA1 = this.moon.sampleCleanRadiusAt(dir.x + this._tmpTangentA.x * eps, dir.y + this._tmpTangentA.y * eps, dir.z + this._tmpTangentA.z * eps);
            const rA0 = this.moon.sampleCleanRadiusAt(dir.x - this._tmpTangentA.x * eps, dir.y - this._tmpTangentA.y * eps, dir.z - this._tmpTangentA.z * eps);
            const rB1 = this.moon.sampleCleanRadiusAt(dir.x + this._tmpTangentB.x * eps, dir.y + this._tmpTangentB.y * eps, dir.z + this._tmpTangentB.z * eps);
            const rB0 = this.moon.sampleCleanRadiusAt(dir.x - this._tmpTangentB.x * eps, dir.y - this._tmpTangentB.y * eps, dir.z - this._tmpTangentB.z * eps);

            const slopeA = (rA1 - rA0) / (2 * eps * R);
            const slopeB = (rB1 - rB0) / (2 * eps * R);
            this._tmpSlopeNormal.copy(dir)
                .addScaledVector(this._tmpTangentA, -slopeA * 0.75)
                .addScaledVector(this._tmpTangentB, -slopeB * 0.75)
                .normalize();

            const basePos = dir.clone().multiplyScalar(cleanR - 0.006);
            mesh.position.copy(basePos);
            this._tmpQuat.setFromUnitVectors(this._upAxis, this._tmpSlopeNormal);
            this._tmpYawQuat.setFromAxisAngle(this._tmpSlopeNormal, rand() * Math.PI * 2);
            const baseQuat = this._tmpYawQuat.clone().multiply(this._tmpQuat);
            mesh.quaternion.copy(baseQuat);

            const maxHp = tier === 3 ? 8 : (tier === 2 ? 5 : 3);
            const hpBarOffset = finalHeightY + 0.028;

            const hpBgSprite = new THREE.Sprite(this.hpBgMat);
            hpBgSprite.scale.set(0.086, 0.016, 1);
            hpBgSprite.renderOrder = 10;
            hpBgSprite.position.copy(basePos).addScaledVector(dir, hpBarOffset);
            hpBgSprite.visible = false;

            const hpFillMat = new THREE.SpriteMaterial({
                color: '#22C55E',
                depthTest: true,
                depthWrite: false
            });
            const hpFillSprite = new THREE.Sprite(hpFillMat);
            hpFillSprite.scale.set(0.078, 0.010, 1);
            hpFillSprite.renderOrder = 11;
            hpFillSprite.position.copy(hpBgSprite.position);
            hpFillSprite.visible = false;

            this.group.add(mesh);
            this.group.add(hpBgSprite);
            this.group.add(hpFillSprite);
            this.rocks.push({
                mesh,
                dir,
                basePos,
                baseQuat,
                color: rockColor,
                collisionRadius: Math.max(finalRadX, finalRadZ) * 0.90,
                height: finalHeightY,
                tier,
                hp: maxHp,
                maxHp,
                hitShake: 0,
                crackUniform,
                hpBgSprite,
                hpFillSprite,
                hpFillMat,
                hpBarOffset,
                hpBarTimer: 0
            });
        }
    }

    private createOrganicRockGeometry(
        rockSeed: number,
        radX: number,
        radZ: number,
        heightY: number
    ): THREE.BufferGeometry {
        const geom = new THREE.IcosahedronGeometry(1.0, 1);
        const pos = geom.attributes.position;
        const rand = createPRNG(rockSeed);

        const p1 = rand() * 10;
        const p2 = rand() * 10;
        const p3 = rand() * 10;
        const leanX = (rand() - 0.5) * 0.25;
        const leanZ = (rand() - 0.5) * 0.25;

        for (let i = 0; i < pos.count; i++) {
            const vx = pos.getX(i);
            const vy = pos.getY(i);
            const vz = pos.getZ(i);

            const n1 = Math.sin(vx * 3.1 + p1) * Math.cos(vy * 2.7 + p2) * Math.sin(vz * 3.3 + p3);
            const n2 = Math.cos(vx * 5.2 - p2) * Math.sin(vz * 4.8 + p1);
            const radialWarp = 0.84 + 0.24 * (n1 * 0.65 + n2 * 0.35 + 0.5);

            if (vy <= 0.02) {
                const baseSpread = 1.05 * radialWarp;
                pos.setXYZ(i, vx * radX * baseSpread, 0.0, vz * radZ * baseSpread);
            } else {
                const topFrac = Math.min(1.0, vy);
                const yWarp = 0.82 + 0.35 * (0.5 + 0.5 * n1);
                const x = vx * radX * radialWarp + leanX * topFrac * radX;
                const z = vz * radZ * radialWarp + leanZ * topFrac * radZ;
                const y = Math.max(0.08 * heightY, topFrac * heightY * yWarp);
                pos.setXYZ(i, x, y, z);
            }
        }

        pos.needsUpdate = true;
        geom.computeVertexNormals();
        return geom;
    }

    /**
     * Spawns outlined angular rock chunk particles affected by lunar gravity.
     */
    private spawnDebrisBurst(rock: MoonRock, count: number, isShatter: boolean): void {
        const originR = rock.basePos.length() + rock.height * (isShatter ? 0.45 : 0.65);
        this._tmpHitPos.copy(rock.dir).multiplyScalar(originR);

        // Local tangent basis around rock.dir
        this._tmpTangentA.set(Math.abs(rock.dir.y) < 0.9 ? 0 : 1, Math.abs(rock.dir.y) < 0.9 ? 1 : 0, 0)
            .cross(rock.dir).normalize();
        this._tmpTangentB.crossVectors(rock.dir, this._tmpTangentA).normalize();

        for (let i = 0; i < count; i++) {
            const d = this.debrisPool[this.debrisCursor];
            this.debrisCursor = (this.debrisCursor + 1) % this.MAX_DEBRIS;

            d.active = true;
            d.mesh.visible = true;
            d.mat.color.copy(rock.color);
            d.mat.color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.06);

            const ang = Math.random() * Math.PI * 2;
            const spreadSpeed = isShatter ? (0.14 + Math.random() * 0.22) : (0.10 + Math.random() * 0.14);
            const upSpeed = isShatter ? (0.20 + Math.random() * 0.22) : (0.16 + Math.random() * 0.16);

            d.pos.copy(this._tmpHitPos)
                .addScaledVector(this._tmpTangentA, Math.cos(ang) * rock.collisionRadius * 0.35)
                .addScaledVector(this._tmpTangentB, Math.sin(ang) * rock.collisionRadius * 0.35);

            this._tmpVel.copy(rock.dir).multiplyScalar(upSpeed)
                .addScaledVector(this._tmpTangentA, Math.cos(ang) * spreadSpeed)
                .addScaledVector(this._tmpTangentB, Math.sin(ang) * spreadSpeed);
            d.vel.copy(this._tmpVel);

            d.upDir.copy(rock.dir);
            d.rotVel.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
            d.groundR = this.moon.sampleCleanRadiusAt(rock.dir.x, rock.dir.y, rock.dir.z) + 0.004;
            d.life = 0;
            d.maxLife = isShatter ? (0.65 + Math.random() * 0.35) : (0.42 + Math.random() * 0.22);
            d.baseScale = isShatter ? (0.85 + Math.random() * 0.65) : (0.55 + Math.random() * 0.40);

            d.mesh.position.copy(d.pos);
            d.mesh.scale.setScalar(d.baseScale);
        }
    }

    /**
     * Applies hammer damage to a rock, triggers shake + cracks + chip debris,
     * and shatters it into coins + outlined debris chunks when HP reaches 0.
     * Returns coin reward (> 0) if the rock shattered, else 0.
     */
    public damageRock(rock: MoonRock, damage = 1): { hit: boolean; shattered: boolean; coinReward: number; tier: number } {
        const idx = this.rocks.indexOf(rock);
        if (idx === -1) return { hit: false, shattered: false, coinReward: 0, tier: rock.tier };

        rock.hp = Math.max(0, rock.hp - damage);
        rock.hitShake = 1.0;

        if (rock.hp > 0) {
            const hpFrac = rock.hp / rock.maxHp;
            const dmgFrac = 1.0 - hpFrac;
            rock.crackUniform.value = dmgFrac;

            // Show & update simple health bar width (left-aligned) and color (green -> yellow -> red)
            rock.hpBarTimer = 3.0;
            rock.hpBgSprite.visible = true;
            rock.hpFillSprite.visible = true;
            rock.hpBgSprite.scale.set(0.086, 0.016, 1);

            const barW = 0.078;
            rock.hpFillSprite.scale.set(barW * hpFrac, 0.010, 1);
            rock.hpFillSprite.center.set(0.5 / hpFrac, 0.5);
            if (hpFrac > 0.5) {
                rock.hpFillMat.color.lerpColors(this._hpYellow, this._hpGreen, (hpFrac - 0.5) * 2.0);
            } else {
                rock.hpFillMat.color.lerpColors(this._hpRed, this._hpYellow, hpFrac * 2.0);
            }

            this.spawnDebrisBurst(rock, 5, false);
            return { hit: true, shattered: false, coinReward: 0, tier: rock.tier };
        }

        // Rock shattered! Spawn outlined rock chunks & award direct coins
        this.spawnDebrisBurst(rock, 14, true);

        const coinReward = rock.isGolden
            ? (250 + Math.round(rock.maxHp * 5))
            : (rock.tier === 3 ? 75 : (rock.tier === 2 ? 35 : 15));
        const tier = rock.tier;

        if (rock.mesh.geometry) rock.mesh.geometry.dispose();
        if (rock.mesh.material) {
            const mats = Array.isArray(rock.mesh.material) ? rock.mesh.material : [rock.mesh.material];
            for (const m of mats) m.dispose();
        }
        this.group.remove(rock.mesh);
        rock.hpFillMat.dispose();
        this.group.remove(rock.hpBgSprite);
        this.group.remove(rock.hpFillSprite);
        this.rocks.splice(idx, 1);

        return { hit: true, shattered: true, coinReward, tier };
    }

    /**
     * Updates rock impact vibrations and gravity-driven shrinking debris chunks.
     */
    public update(dt: number): void {
        const now = performance.now() * 0.001;

        for (let i = 0; i < this.rocks.length; i++) {
            const rock = this.rocks[i];
            if (rock.hitShake > 0.001) {
                rock.hitShake = Math.max(0, rock.hitShake - dt * 5.2);
                const s = rock.hitShake;
                const vib = Math.sin(now * 68.0 + i) * 0.0065 * s;

                this._tmpTangentA.set(Math.abs(rock.dir.y) < 0.9 ? 0 : 1, Math.abs(rock.dir.y) < 0.9 ? 1 : 0, 0)
                    .cross(rock.dir).normalize();
                rock.mesh.position.copy(rock.basePos).addScaledVector(this._tmpTangentA, vib);

                const squash = Math.sin(s * Math.PI) * 0.16;
                rock.mesh.scale.set(1.0 + squash, Math.max(0.7, 1.0 - squash * 0.9), 1.0 + squash);
            } else if (rock.mesh.scale.x !== 1.0) {
                rock.mesh.position.copy(rock.basePos);
                rock.mesh.scale.set(1, 1, 1);
            }

            // Auto-hide rock health bar a few seconds after leaving
            if (rock.hpBarTimer > 0) {
                rock.hpBarTimer = Math.max(0, rock.hpBarTimer - dt);
                if (rock.hpBarTimer <= 0) {
                    rock.hpBgSprite.visible = false;
                    rock.hpFillSprite.visible = false;
                } else {
                    const fadeScale = rock.hpBarTimer < 0.25 ? rock.hpBarTimer / 0.25 : 1.0;
                    const hpFrac = rock.hp / rock.maxHp;
                    rock.hpBgSprite.scale.set(0.086 * fadeScale, 0.016 * fadeScale, 1);
                    rock.hpFillSprite.scale.set(0.078 * hpFrac * fadeScale, 0.010 * fadeScale, 1);
                }
            }
        }

        for (let i = 0; i < this.MAX_DEBRIS; i++) {
            const d = this.debrisPool[i];
            if (!d.active) continue;

            d.life += dt;
            if (d.life >= d.maxLife) {
                d.active = false;
                d.mesh.visible = false;
                continue;
            }

            // Spherical lunar gravity pulling chunk back onto the surface
            d.vel.addScaledVector(d.upDir, -0.95 * dt);
            d.pos.addScaledVector(d.vel, dt);

            const r = d.pos.length();
            if (r < d.groundR) {
                d.pos.multiplyScalar(d.groundR / Math.max(0.0001, r));
                const vRad = d.vel.dot(d.upDir);
                if (vRad < 0) {
                    // Bounce gently and apply surface friction
                    d.vel.addScaledVector(d.upDir, -1.35 * vRad);
                    d.vel.multiplyScalar(0.65);
                }
            }

            d.mesh.position.copy(d.pos);
            d.mesh.rotation.x += d.rotVel.x * dt;
            d.mesh.rotation.y += d.rotVel.y * dt;
            d.mesh.rotation.z += d.rotVel.z * dt;

            // Hold full size briefly then shrink cleanly down to 0
            const t = d.life / d.maxLife;
            let shrink = 1.0;
            if (t > 0.42) {
                const u = (t - 0.42) / 0.58;
                shrink = Math.max(0.001, 1.0 - u * u * (3.0 - 2.0 * u));
            }
            d.mesh.scale.setScalar(d.baseScale * shrink);
        }
    }

    /**
     * Spawns a large, ultra-tough golden boulder at a meteor impact site.
     */
    public spawnGoldenMeteorRock(dir: THREE.Vector3, moonLevel = 1): MoonRock {
        const unitDir = dir.clone().normalize();
        const radX = 0.088;
        const radZ = 0.084;
        const heightY = 0.115;
        const geom = this.createOrganicRockGeometry(Math.floor(Math.random() * 10000), radX, radZ, heightY);

        const crackUniform = { value: 0.0 };
        const goldColor = new THREE.Color('#FACC15');
        const mat = new THREE.MeshStandardMaterial({
            color: goldColor,
            roughness: 0.30,
            metalness: 0.48,
            emissive: new THREE.Color('#D97706'),
            emissiveIntensity: 0.22,
            flatShading: true
        });
        mat.onBeforeCompile = (shader) => {
            shader.uniforms.uCrackAmount = crackUniform;
            shader.vertexShader = `varying vec3 vRockLocalPos;\n` + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>\nvRockLocalPos = position;`
            );
            shader.fragmentShader = `
                uniform float uCrackAmount;
                varying vec3 vRockLocalPos;
                vec3 hash33Gold(vec3 p3) {
                    p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
                    p3 += dot(p3, p3.yxz + 33.33);
                    return fract((p3.xxy + p3.yxx) * p3.zyx);
                }
                float voronoiGold(vec3 x) {
                    vec3 n = floor(x);
                    vec3 f = fract(x);
                    float d1 = 8.0, d2 = 8.0;
                    for (int k = -1; k <= 1; k++) {
                        for (int j = -1; j <= 1; j++) {
                            for (int i = -1; i <= 1; i++) {
                                vec3 g = vec3(float(i), float(j), float(k));
                                vec3 r = g + hash33Gold(n + g) - f;
                                float d = dot(r, r);
                                if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
                            }
                        }
                    }
                    return sqrt(d2) - sqrt(d1);
                }
            ` + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `#include <color_fragment>
                if (uCrackAmount > 0.01) {
                    float cVal = voronoiGold(vRockLocalPos * 8.0 + vec3(1.3, 2.7, 0.9));
                    float thresh = uCrackAmount * 0.082;
                    float crackMask = 1.0 - smoothstep(thresh, thresh + 0.004, cVal);
                    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.028, 0.04), crackMask * 0.95);
                }`
            );
        };

        const mesh = new THREE.Mesh(geom, mat);
        attachOutline(mesh, { width: 0.0028 });

        const cleanR = this.moon.sampleCleanRadiusAt(unitDir.x, unitDir.y, unitDir.z);
        const basePos = unitDir.clone().multiplyScalar(cleanR - 0.006);
        mesh.position.copy(basePos);
        const baseQuat = new THREE.Quaternion().setFromUnitVectors(this._upAxis, unitDir);
        mesh.quaternion.copy(baseQuat);

        const maxHp = 10 + Math.min(8, moonLevel * 2);
        const hpBarOffset = heightY + 0.032;

        const hpBgSprite = new THREE.Sprite(this.hpBgMat);
        hpBgSprite.scale.set(0.096, 0.018, 1);
        hpBgSprite.renderOrder = 10;
        hpBgSprite.position.copy(basePos).addScaledVector(unitDir, hpBarOffset);
        hpBgSprite.visible = false;

        const hpFillMat = new THREE.SpriteMaterial({ color: '#22C55E', depthTest: true, depthWrite: false });
        const hpFillSprite = new THREE.Sprite(hpFillMat);
        hpFillSprite.scale.set(0.088, 0.012, 1);
        hpFillSprite.renderOrder = 11;
        hpFillSprite.position.copy(hpBgSprite.position);
        hpFillSprite.visible = false;

        this.group.add(mesh);
        this.group.add(hpBgSprite);
        this.group.add(hpFillSprite);

        const rock: MoonRock = {
            mesh,
            dir: unitDir,
            basePos,
            baseQuat,
            color: goldColor,
            collisionRadius: Math.max(radX, radZ) * 0.90,
            height: heightY,
            tier: 3,
            isGolden: true,
            hp: maxHp,
            maxHp,
            hitShake: 1.0,
            crackUniform,
            hpBgSprite,
            hpFillSprite,
            hpFillMat,
            hpBarOffset,
            hpBarTimer: 0
        };
        this.rocks.push(rock);
        this.spawnDebrisBurst(rock, 12, false);
        return rock;
    }

    public resolveRoverCollision(
        roverUp: THREE.Vector3,
        roverForward: THREE.Vector3,
        roverLeft: THREE.Vector3,
        speed: number
    ): number {
        if (this.rocks.length === 0) return speed;

        const R = Math.max(0.5, this.moon.moonScale);
        const roverRadius = 0.082;
        let currentSpeed = speed;

        for (let i = 0; i < this.rocks.length; i++) {
            const rock = this.rocks[i];
            const minChord = rock.collisionRadius + roverRadius;
            const minAngle = minChord / R;

            const dot = THREE.MathUtils.clamp(roverUp.dot(rock.dir), -1, 1);
            if (dot < 0.5) continue;

            const dx = roverUp.x - rock.dir.x;
            const dy = roverUp.y - rock.dir.y;
            const dz = roverUp.z - rock.dir.z;
            const chordDistSq = (dx * dx + dy * dy + dz * dz) * (R * R);

            if (chordDistSq < minChord * minChord) {
                this._tmpPushDir.copy(roverUp).addScaledVector(rock.dir, -dot);
                const pushLen = this._tmpPushDir.length();
                if (pushLen < 0.00001) {
                    this._tmpPushDir.copy(roverForward);
                } else {
                    this._tmpPushDir.multiplyScalar(1.0 / pushLen);
                }

                const cosA = Math.cos(minAngle);
                const sinA = Math.sin(minAngle);
                roverUp.copy(rock.dir).multiplyScalar(cosA).addScaledVector(this._tmpPushDir, sinA).normalize();

                roverLeft.crossVectors(roverUp, roverForward).normalize();
                roverForward.crossVectors(roverLeft, roverUp).normalize();

                this._tmpVelDir.copy(roverForward).multiplyScalar(currentSpeed);
                const velIntoRock = -this._tmpVelDir.dot(this._tmpPushDir);
                if (velIntoRock > 0) {
                    const tangentDot = Math.abs(roverForward.dot(this._tmpPushDir));
                    currentSpeed *= Math.max(0.15, 1.0 - tangentDot * 0.92);
                }
            }
        }

        return currentSpeed;
    }

    /**
     * Returns the closest rock in front of the rover's front tool mount (or null if none).
     */
    public getTargetRockAhead(
        roverUp: THREE.Vector3,
        roverForward: THREE.Vector3,
        currentlyHammer: boolean
    ): MoonRock | null {
        if (this.rocks.length === 0) return null;

        const R = Math.max(0.5, this.moon.moonScale);
        this._tmpSensorDir.copy(roverUp).addScaledVector(roverForward, 0.115 / R).normalize();

        const extraRange = currentlyHammer ? 0.17 : 0.14;
        let closestRock: MoonRock | null = null;
        let closestDistSq = Infinity;

        for (let i = 0; i < this.rocks.length; i++) {
            const rock = this.rocks[i];
            if (this._tmpSensorDir.dot(rock.dir) < 0.4) continue;

            const dx = this._tmpSensorDir.x - rock.dir.x;
            const dy = this._tmpSensorDir.y - rock.dir.y;
            const dz = this._tmpSensorDir.z - rock.dir.z;
            const worldDistSq = (dx * dx + dy * dy + dz * dz) * (R * R);
            const triggerDist = rock.collisionRadius + extraRange;

            if (worldDistSq <= triggerDist * triggerDist && worldDistSq < closestDistSq) {
                closestDistSq = worldDistSq;
                closestRock = rock;
            }
        }

        if (closestRock) {
            closestRock.hpBarTimer = Math.max(closestRock.hpBarTimer, 2.5);
            closestRock.hpBgSprite.visible = true;
            closestRock.hpFillSprite.visible = true;
            closestRock.hpBgSprite.scale.set(0.086, 0.016, 1);
            const hpFrac = closestRock.hp / closestRock.maxHp;
            closestRock.hpFillSprite.scale.set(0.078 * hpFrac, 0.010, 1);
        }

        return closestRock;
    }
}
