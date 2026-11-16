import * as THREE from 'three';
import { Moon } from '../entities/Moon';
import { Rover } from '../entities/Rover';
import { ConfigManager } from '../core/Config';

export class SweeperSystem {
    private moon: Moon;
    private rover: Rover;
    private _sweeperCenterDir = new THREE.Vector3();

    // Sound / Event callback hooks
    public onDirtSwept?: (tier: number, amount: number) => void;

    constructor(moon: Moon, rover: Rover) {
        this.moon = moon;
        this.rover = rover;
    }

    public update(dt: number, forceSweep = false): void {
        const cfg = ConfigManager.current;
        const u = this.rover.up;
        const f = this.rover.forward;
        const l = this.rover.left;

        const invMoonScale = 1.0 / Math.max(0.1, this.moon.moonScale);

        // Center of the front sweeper roller (world forward offset converted to unit sphere angle)
        this._sweeperCenterDir.copy(u).addScaledVector(f, 0.098 * invMoonScale).normalize();

        const halfWidth = (cfg.sweeperWidth * 0.5) * invMoonScale;
        const halfDepth = 0.045 * invMoonScale;
        const maxSweepRadius = Math.hypot(halfWidth, halfDepth) + 0.035 * invMoonScale;

        const isMoving = Math.abs(this.rover.speed) > 0.012;

        // Query spatial grid around rover center 'u' with wide radius to cover BOTH front sweeper & all 4 wheels
        const queryRadius = Math.max(0.22 * invMoonScale, maxSweepRadius + 0.08 * invMoonScale);
        const candidateIndices = this.moon.spatialGrid.queryVerticesNear(u, queryRadius);

        const sweepRate = forceSweep ? 1.0 : Math.min(1.0, cfg.brushPower * (0.35 + dt * 16.0));
        const trailRate = Math.min(1.0, dt * 14.0);

        let sweptDirtDelta = 0;
        let anyVertexChanged = false;
        let highestTierSwept = 1;

        const scx = this._sweeperCenterDir.x;
        const scy = this._sweeperCenterDir.y;
        const scz = this._sweeperCenterDir.z;

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

            // 1. Soft Elliptical Brush Profile with smooth feathering (prevents stepped polygon teeth)
            const sdx = vx - scx;
            const sdy = vy - scy;
            const sdz = vz - scz;

            const alongF = sdx * f.x + sdy * f.y + sdz * f.z;
            const alongL = sdx * l.x + sdy * l.y + sdz * l.z;

            const normF = Math.abs(alongF) / halfDepth;
            const normL = Math.abs(alongL) / halfWidth;

            if (normF <= 1.25 && normL <= 1.30) {
                const brushDistSq = normF * normF + normL * normL;
                if (brushDistSq <= 1.45) {
                    const brushDist = Math.sqrt(brushDistSq);
                    // Core 0.0 to 0.55 has 100% sweep weight; smooth cubic Hermite falloff extending to 1.20
                    const t = Math.max(0.0, Math.min(1.0, (brushDist - 0.55) / (1.20 - 0.55)));
                    const brushWeight = 1.0 - t * t * (3.0 - 2.0 * t);
                    const prevDirt = dirtAmounts[i];

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
                            anyVertexChanged = true;
                        }
                    }

                    // Clean old wheel trails under brush ONLY when moving forward (so reversing doesn't erase freshly stamped tracks)
                    if (this.rover.speed > 0.01 && trailAmounts[i] > 0.001) {
                        trailAmounts[i] = Math.max(0.0, trailAmounts[i] - sweepRate * brushWeight);
                        if (trailAmounts[i] <= 0.005) {
                            trailAmounts[i] = 0.0;
                            this.moon.activeTrailIndices.delete(i);
                        }
                        anyVertexChanged = true;
                    }
                }
            }

            // 2. Smooth Continuous Gaussian Tire Trails (Active in BOTH forward and backward motion)
            if (cfg.trailsEnabled && isMoving) {
                const pdx = vx - u.x;
                const pdy = vy - u.y;
                const pdz = vz - u.z;

                const pAlongF = pdx * f.x + pdy * f.y + pdz * f.z;
                const pAlongL = pdx * l.x + pdy * l.y + pdz * l.z;

                // Covers wheelbase (front wheels at +0.05, rear wheels at -0.05 in world space)
                if (Math.abs(pAlongF) < 0.082 * invMoonScale) {
                    // Distance to left and right wheel lines (centered at ±0.052 in world space)
                    const distLeft = Math.abs(pAlongL - 0.052 * invMoonScale);
                    const distRight = Math.abs(pAlongL + 0.052 * invMoonScale);
                    const minWheelDist = Math.min(distLeft, distRight);

                    // Smooth Gaussian bell-curve falloff across tire track (refined & narrower)
                    if (minWheelDist < 0.022 * invMoonScale) {
                        const sigma = 0.009 * invMoonScale;
                        const wheelWeight = Math.exp(-(minWheelDist * minWheelDist) / (2 * sigma * sigma));
                        const prevTrail = trailAmounts[i];
                        const deltaTrail = trailRate * wheelWeight * 0.90;

                        if (prevTrail < 0.98 && deltaTrail > 0.005) {
                            trailAmounts[i] = Math.min(1.0, prevTrail + deltaTrail);
                            this.moon.activeTrailIndices.add(i);
                            anyVertexChanged = true;
                        }
                    }
                }
            }
        }

        if (anyVertexChanged) {
            this.moon.geometry.attributes.aDirt.needsUpdate = true;
            this.moon.geometry.attributes.aTrail.needsUpdate = true;
            this.moon.updateVertexHeightsFast(candidateIndices);
        }

        // Fill vacuum canister cart with swept dust (scaled by debug tank fill speed setting)
        if (sweptDirtDelta > 0 && !forceSweep) {
            const fillSpeed = cfg.tankFillSpeed !== undefined ? cfg.tankFillSpeed : 1.0;
            this.rover.addDust(sweptDirtDelta * 0.065 * fillSpeed);
        }

        // Spawn dust puff particles
        if (sweptDirtDelta > 0.06 && !forceSweep) {
            const count = Math.min(3, Math.ceil(sweptDirtDelta * 0.5));
            for (let k = 0; k < count; k++) {
                const sideSpread = (Math.random() - 0.5) * (cfg.sweeperWidth * invMoonScale) * 0.85;
                const puffPos = this._sweeperCenterDir.clone()
                    .addScaledVector(l, sideSpread)
                    .multiplyScalar(1.015 + this.moon.dirtHeight * 0.5);

                const puffVel = u.clone().multiplyScalar((0.14 + Math.random() * 0.14) * invMoonScale)
                    .addScaledVector(f, (-0.06 - Math.random() * 0.08) * invMoonScale)
                    .addScaledVector(l, (Math.random() - 0.5) * 0.14 * invMoonScale);

                this.rover.spawnDustPuff(puffPos, puffVel);
            }

            if (this.onDirtSwept) {
                this.onDirtSwept(highestTierSwept, sweptDirtDelta);
            }
        }
    }
}
