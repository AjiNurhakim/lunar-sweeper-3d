import * as THREE from 'three';
import { Moon } from '../entities/Moon';
import { Rover } from '../entities/Rover';
import { ConfigManager } from '../core/Config';

export class SweeperSystem {
    private moon: Moon;
    private rover: Rover;
    private _sweeperCenterDir = new THREE.Vector3();
    private _prevSweeperCenterDir = new THREE.Vector3();
    private _hasPrevDir = false;
    private _tmpPuffDir = new THREE.Vector3();
    private _tmpPuffPos = new THREE.Vector3();
    private _tmpPuffVel = new THREE.Vector3();

    // Sound / Event callback hooks
    public onDirtSwept?: (tier: number, amount: number) => void;
    public onTankFullBlocked?: () => void;
    private lastTankFullNoticeTime = 0;
    private lastPuffSpawnTime = 0;
    // Reservoir of exact swept vertex positions & tiers for accurate particle placement
    private sweptSamplesX = new Float32Array(8);
    private sweptSamplesY = new Float32Array(8);
    private sweptSamplesZ = new Float32Array(8);
    private sweptSamplesTier = new Uint8Array(8);
    private sweptSampleCount = 0;

    constructor(moon: Moon, rover: Rover) {
        this.moon = moon;
        this.rover = rover;
    }

    public resetSweepHistory(): void {
        this._hasPrevDir = false;
    }

    public update(dt: number, forceSweep = false): void {
        const cfg = ConfigManager.current;
        const u = this.rover.up;
        const f = this.rover.forward;
        const l = this.rover.left;

        const invMoonScale = 1.0 / Math.max(0.1, this.moon.moonScale);

        // Center of the front sweeper roller (world forward offset converted to unit sphere angle)
        this._sweeperCenterDir.copy(u).addScaledVector(f, 0.098 * invMoonScale).normalize();

        // Read effective stats (includes EconomySystem upgrades + ConfigManager base tuning)
        const effectiveWidth = this.rover.stats.sweeperWidth > 0 ? this.rover.stats.sweeperWidth : cfg.sweeperWidth;
        const effectivePower = this.rover.stats.sweeperPower > 0 ? this.rover.stats.sweeperPower : cfg.brushPower;

        const halfWidth = (effectiveWidth * 0.50) * invMoonScale;
        const halfDepth = 0.026 * invMoonScale;
        const maxSweepRadius = Math.hypot(halfWidth, halfDepth) + 0.025 * invMoonScale;

        const isMoving = Math.abs(this.rover.speed) > 0.012;
        // When stationary and not sweeping or forced, skip heavy spatial query to maximize FPS
        if (!isMoving && !forceSweep && !this.rover.isActivelySweeping) {
            this._hasPrevDir = false;
            return;
        }

        const isTankFull = !forceSweep && this.rover.isTankFull();
        let attemptedSweepWhileFull = false;

        // Query spatial grid around rover center 'u' with wide radius to cover BOTH front sweeper & all 4 wheels
        const queryRadius = Math.max(0.20 * invMoonScale, maxSweepRadius + 0.07 * invMoonScale);
        const candidateIndices = this.moon.spatialGrid.queryVerticesNear(u, queryRadius);

        const sweepRate = forceSweep ? 1.0 : Math.min(1.0, effectivePower * 1.5);
        const trailRate = Math.min(1.0, dt * 14.0);

        let sweptDirtDelta = 0;
        let anyDirtChanged = false;
        let anyTrailChanged = false;
        let highestTierSwept = 1;
        let totalSweepPenalty = 0;
        let totalSweepWeight = 0;
        let sweptTier1 = 0;
        let sweptTier2 = 0;
        let sweptTier3 = 0;
        this.sweptSampleCount = 0;

        const scx = this._sweeperCenterDir.x;
        const scy = this._sweeperCenterDir.y;
        const scz = this._sweeperCenterDir.z;

        // Continuous capsule sweep between previous frame and current frame (zero gaps/notches between steps!)
        const hasPrev = this._hasPrevDir && !forceSweep;
        const p0x = hasPrev ? this._prevSweeperCenterDir.x : scx;
        const p0y = hasPrev ? this._prevSweeperCenterDir.y : scy;
        const p0z = hasPrev ? this._prevSweeperCenterDir.z : scz;

        const p1x = scx;
        const p1y = scy;
        const p1z = scz;

        const segDx = p1x - p0x;
        const segDy = p1y - p0y;
        const segDz = p1z - p0z;
        const segLenSq = segDx * segDx + segDy * segDy + segDz * segDz;

        const basePos = this.moon.baseUnitPositions;
        const dirtAmounts = this.moon.dirtAmounts;
        const dirtTiers = this.moon.dirtTiers;
        const trailAmounts = this.moon.trailAmounts;

        for (let k = 0; k < candidateIndices.length; k++) {
            const i = candidateIndices[k];
            const idx = i * 3;
            const vx = basePos[idx];
            const vy = basePos[idx + 1];
            const vz = basePos[idx + 2];

            // 1. Continuous capsule ribbon distance to sweeper roller line segment
            let cx = p1x;
            let cy = p1y;
            let cz = p1z;
            let t = 1.0;

            if (segLenSq > 0.0000001) {
                t = Math.max(0.0, Math.min(1.0, ((vx - p0x) * segDx + (vy - p0y) * segDy + (vz - p0z) * segDz) / segLenSq));
                cx = p0x + t * segDx;
                cy = p0y + t * segDy;
                cz = p0z + t * segDz;
            }

            const sdx = vx - cx;
            const sdy = vy - cy;
            const sdz = vz - cz;

            // Oriented roller distance: matches physical roller width laterally and thin roller radius forward/backward
            const normLat = Math.abs(sdx * l.x + sdy * l.y + sdz * l.z) / halfWidth;
            const normFwd = Math.abs(sdx * f.x + sdy * f.y + sdz * f.z) / halfDepth;

            if (normLat <= 1.05 && normFwd <= 1.05) {
                const prevDirt = dirtAmounts[i];

                if (isTankFull) {
                    // Tank is full: cannot vacuum dust or erase trails
                    if (prevDirt > 0.05 && isMoving) {
                        attemptedSweepWhileFull = true;
                    }
                } else {
                    let wLat = 1.0;
                    if (normLat > 0.78) {
                        const s = Math.min(1.0, (normLat - 0.78) / 0.27);
                        wLat = 1.0 - s * s * (3.0 - 2.0 * s);
                    }
                    let wFwd = 1.0;
                    if (normFwd > 0.72) {
                        const s = Math.min(1.0, (normFwd - 0.72) / 0.33);
                        wFwd = 1.0 - s * s * (3.0 - 2.0 * s);
                    }
                    const brushWeight = wLat * wFwd;

                        if (prevDirt > 0.001) {
                            const tier = dirtTiers[i];
                            highestTierSwept = Math.max(highestTierSwept, tier);

                            const effectiveSweep = sweepRate * brushWeight;
                            const nextDirt = Math.max(0.0, prevDirt - effectiveSweep);
                            const delta = prevDirt - nextDirt;

                            if (delta > 0) {
                                dirtAmounts[i] = nextDirt;
                                this.moon.totalDirtSum = Math.max(0, this.moon.totalDirtSum - delta);
                                sweptDirtDelta += delta;
                                anyDirtChanged = true;

                                // Slowdown penalty per tier, reduced by rover sweeperPower upgrade:
                                // Tier 1: base 0.10, Tier 2: base 0.50, Tier 3: base 0.90
                                const basePenalty = tier >= 2.5 ? 0.90 : (tier >= 1.5 ? 0.50 : 0.10);
                                const powerRelief = Math.max(0.25, 1.0 / Math.max(1.0, effectivePower));
                                const penalty = basePenalty * powerRelief;
                                totalSweepPenalty += delta * penalty;
                                totalSweepWeight += delta;

                                if (tier >= 2.5) {
                                    sweptTier3 += delta;
                                } else if (tier >= 1.5) {
                                    sweptTier2 += delta;
                                } else {
                                    sweptTier1 += delta;
                                }

                                // Record exact swept dirt coordinates (reservoir sampling up to 8 spots)
                                if (delta > 0.015) {
                                    const slot = this.sweptSampleCount < 8
                                        ? this.sweptSampleCount++
                                        : Math.floor(Math.random() * 8);
                                    this.sweptSamplesX[slot] = vx;
                                    this.sweptSamplesY[slot] = vy;
                                    this.sweptSamplesZ[slot] = vz;
                                    this.sweptSamplesTier[slot] = tier >= 2.5 ? 3 : (tier >= 1.5 ? 2 : 1);
                                }
                            }
                        }

                        // Clean old wheel trails under brush ONLY when moving forward (so reversing doesn't erase freshly stamped tracks)
                        if (this.rover.speed > 0.01 && trailAmounts[i] > 0.001) {
                            trailAmounts[i] = Math.max(0.0, trailAmounts[i] - sweepRate * brushWeight);
                            if (trailAmounts[i] <= 0.005) {
                                trailAmounts[i] = 0.0;
                                this.moon.activeTrailIndices.delete(i);
                            }
                            anyTrailChanged = true;
                        }
                    }
                }
            }

        // Paint per-pixel high-resolution dirt texture
        if (!isTankFull) {
            this.moon.paintDirtCapsule(
                p0x, p0y, p0z,
                p1x, p1y, p1z,
                f.x, f.y, f.z,
                l.x, l.y, l.z,
                halfWidth,
                halfDepth,
                sweepRate
            );
        }

        // Save last sweeper position for continuous interpolation on next frame
        this._prevSweeperCenterDir.copy(this._sweeperCenterDir);
        this._hasPrevDir = true;

        if (anyDirtChanged) {
            this.moon.geometry.attributes.aDirt.needsUpdate = true;
            this.moon.updateVertexHeightsFast(candidateIndices);
        }
        if (anyTrailChanged) {
            this.moon.geometry.attributes.aTrail.needsUpdate = true;
        }

        // Update rover sweeping slowdown state based on active dirt tier
        // When reversing, ignore tiny edge-grazing on already-swept paths while still slowing on thick unswept dust
        const minSweepDelta = this.rover.speed < -0.01 ? 0.025 : 0.0001;
        if (sweptDirtDelta > minSweepDelta && !forceSweep) {
            const activePenalty = totalSweepWeight > 0 ? (totalSweepPenalty / totalSweepWeight) : 0.10;
            this.rover.setSweepingState(true, activePenalty, highestTierSwept);
        } else {
            this.rover.setSweepingState(false, 0.0, 0);
        }

        // Fill vacuum canister cart with swept dust:
        // Scaled consistently so sweeping 10 meters collects the exact same kg of dust regardless of moon scale
        if (sweptDirtDelta > 0 && !forceSweep) {
            const fillSpeed = cfg.tankFillSpeed !== undefined ? cfg.tankFillSpeed : 1.0;
            // Detail 6 (40,962 verts) baseline fill factor; (R * R) compensates for 1/R^2 vertex density drop on large spheres
            const factor = 0.065 * fillSpeed * (this.moon.moonScale * this.moon.moonScale);
            this.rover.addDustTiers(sweptTier1 * factor, sweptTier2 * factor, sweptTier3 * factor);
        }

        // Spawn dust puffs controlled by user slider (cfg.dustParticleRate)
        const normalizedDelta = sweptDirtDelta * (40962.0 / Math.max(1, this.moon.numVerts));
        if (normalizedDelta > 0.025 && !forceSweep) {
            const dominantTier = (sweptTier3 >= sweptTier2 && sweptTier3 >= sweptTier1 && sweptTier3 > 0)
                ? 3
                : ((sweptTier2 >= sweptTier1 && sweptTier2 > 0) ? 2 : 1);

            const rate = cfg.dustParticleRate ?? 1.0;
            if (rate > 0.05 && this.sweptSampleCount > 0) {
                const cooldownMs = Math.max(16, 48 / Math.max(0.35, rate));
                const now = performance.now();
                if (now - this.lastPuffSpawnTime >= cooldownMs) {
                    this.lastPuffSpawnTime = now;
                    const baseCount = normalizedDelta > 0.45 ? 2 : 1;
                    const count = Math.min(5, Math.max(1, Math.round(baseCount * rate)));
                    for (let k = 0; k < count; k++) {
                        // Pick exact swept dirt coordinate so particles ONLY spawn where dust was swept
                        const sIdx = Math.floor(Math.random() * this.sweptSampleCount);
                        this._tmpPuffDir.set(
                            this.sweptSamplesX[sIdx],
                            this.sweptSamplesY[sIdx],
                            this.sweptSamplesZ[sIdx]
                        );
                        // Tiny local jitter along roller width
                        const microJitter = (Math.random() - 0.5) * 0.018 * invMoonScale;
                        this._tmpPuffDir.addScaledVector(l, microJitter).normalize();

                        const surfaceR = this.moon.sampleActualSurfaceRadiusAt(this._tmpPuffDir.x, this._tmpPuffDir.y, this._tmpPuffDir.z);
                        this._tmpPuffPos.copy(this._tmpPuffDir).multiplyScalar(surfaceR + 0.011);

                        // Kick outward relative to rover center
                        const sideSign = this._tmpPuffDir.dot(l) >= this._sweeperCenterDir.dot(l) ? 1 : -1;
                        const lateralKick = sideSign * (0.06 + Math.random() * 0.08);
                        this._tmpPuffVel.copy(u).multiplyScalar(0.14 + Math.random() * 0.10)
                            .addScaledVector(f, -0.05 - Math.random() * 0.05)
                            .addScaledVector(l, lateralKick);

                        const sampleTier = this.sweptSamplesTier[sIdx] || dominantTier;
                        this.rover.spawnDustPuff(this._tmpPuffPos, this._tmpPuffVel, sampleTier);
                    }
                }
            }

            if (this.onDirtSwept) {
                this.onDirtSwept(dominantTier, normalizedDelta);
            }
        }

        // Notify user if attempting to sweep while tank is full
        if (attemptedSweepWhileFull) {
            const now = performance.now();
            if (now - this.lastTankFullNoticeTime > 3000) {
                this.lastTankFullNoticeTime = now;
                if (this.onTankFullBlocked) {
                    this.onTankFullBlocked();
                }
            }
        }
    }
}
