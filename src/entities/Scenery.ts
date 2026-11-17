import * as THREE from 'three';
import { createPRNG } from '../core/MathUtils';

export interface SpacePresetInfo {
    id: string;
    name: string;
    description: string;
}

export const SPACE_PRESETS: SpacePresetInfo[] = [
    { id: 'void', name: 'Deep Space Voyager', description: 'Angkasa malam dalam dengan bintang berlian & planet berbatu' },
    { id: 'nebula', name: 'Violet Dream Nebula', description: 'Awan gas kosmik volumetrik ungu, magenta & cyan' },
    { id: 'sunset', name: 'Solar Horizon', description: 'Matahari raksasa keemasan dengan korona cahaya atmosfer' },
    { id: 'emerald', name: 'Emerald Titan', description: 'Planet raksasa cincin zamrud dengan kabut kosmik toska' },
    { id: 'aurora', name: 'Aurora Borealis', description: 'Pita tirai cahaya kutub hijau neon, toska & lavender' },
    { id: 'comet', name: 'Glacial Comet', description: 'Komet es bercahaya dengan ekor debu & planet biru es' },
    { id: 'supernova', name: 'Crimson Supernova', description: 'Sisa ledakan bintang merah marun & cincin gelombang kejut' },
    { id: 'blackhole', name: 'Gargantua Black Hole', description: 'Lubang hitam dengan piringan akresi cahaya emas berputar' },
    { id: 'asteroid', name: 'Asteroid Belt', description: 'Sabuk batuan angkasa melayang dalam orbit melengkung' },
    { id: 'synthwave', name: 'Neon Synthwave', description: 'Matahari garis retro dengan sistem bintang biner pink-biru' }
];

export class Scenery {
    public group: THREE.Group;
    public currentPreset = 'void';
    private scene: THREE.Scene;
    private celestialGroup: THREE.Group;

    // Shooting star / meteor streak system
    private shootingStarMesh!: THREE.Mesh;
    private shootingStarTimer = 0;
    private shootingStarInterval = 14;
    private shootingStarActive = false;
    private shootingStarLife = 0;
    private shootingStarDuration = 0.65;
    private shootingStarStart = new THREE.Vector3();
    private shootingStarVelocity = new THREE.Vector3();

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.scene.add(this.group);

        this.celestialGroup = new THREE.Group();
        this.group.add(this.celestialGroup);

        this.initShootingStar();
    }

    private initShootingStar(): void {
        const geom = new THREE.CylinderGeometry(0.015, 0.08, 3.4, 4);
        geom.rotateX(Math.PI / 2); // Align forward along Z
        const mat = new THREE.MeshBasicMaterial({
            color: '#FFFFFF',
            transparent: true,
            opacity: 0.0,
            depthWrite: false
        });
        this.shootingStarMesh = new THREE.Mesh(geom, mat);
        this.shootingStarMesh.visible = false;
        this.group.add(this.shootingStarMesh);
    }

    public build(preset: string = 'void', seed: number = 7777): void {
        this.currentPreset = preset;

        // Clean up old objects
        while (this.celestialGroup.children.length > 0) {
            const child = this.celestialGroup.children[0] as THREE.Mesh;
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
            this.celestialGroup.remove(child);
        }

        const rand = createPRNG(seed);

        // Helper 1: Add low-poly diamond stars (Octahedrons)
        const addStars = (baseCount: number, rMin: number, rMax: number, palette: string[], sMin = 0.06, sMax = 0.22) => {
            const starGeom = new THREE.OctahedronGeometry(1, 0);
            for (let i = 0; i < baseCount; i++) {
                const u = rand();
                const v = rand();
                const theta = 2 * Math.PI * u;
                const phi = Math.acos(2 * v - 1);
                const r = rMin + rand() * (rMax - rMin);

                const x = r * Math.sin(phi) * Math.cos(theta);
                const y = r * Math.sin(phi) * Math.sin(theta);
                const z = r * Math.cos(phi);

                const colorHex = palette[Math.floor(rand() * palette.length)];
                const mat = new THREE.MeshBasicMaterial({ color: colorHex });
                const star = new THREE.Mesh(starGeom, mat);
                star.position.set(x, y, z);

                const s = sMin + Math.pow(rand(), 2.2) * (sMax - sMin);
                star.scale.setScalar(s);
                star.rotation.set(rand() * 3, rand() * 3, rand() * 3);
                this.celestialGroup.add(star);
            }
        };

        // Helper 2: Add volumetric translucent nebula clouds
        const addNebulaPuffs = (clusters: number, colors: string[], distMean = 38, clusterSpread = 9) => {
            const puffGeom = new THREE.IcosahedronGeometry(1, 2);
            for (let c = 0; c < clusters; c++) {
                const theta = rand() * Math.PI * 2;
                const phi = 0.35 + rand() * (Math.PI - 0.7);
                const dist = distMean + rand() * 12;

                const bx = dist * Math.sin(phi) * Math.cos(theta);
                const by = dist * Math.cos(phi);
                const bz = dist * Math.sin(phi) * Math.sin(theta);

                const col = colors[c % colors.length];
                const count = 4 + Math.floor(rand() * 3);
                for (let p = 0; p < count; p++) {
                    const mat = new THREE.MeshBasicMaterial({
                        color: col,
                        transparent: true,
                        opacity: 0.12,
                        depthWrite: false
                    });
                    const puff = new THREE.Mesh(puffGeom, mat);
                    puff.position.set(
                        bx + (rand() - 0.5) * clusterSpread,
                        by + (rand() - 0.5) * (clusterSpread * 0.7),
                        bz + (rand() - 0.5) * clusterSpread
                    );
                    const scale = 5 + rand() * 7;
                    puff.scale.set(scale * 1.3, scale * 0.85, scale);
                    this.celestialGroup.add(puff);
                }
            }
        };

        // 1. VOID VOYAGER (Deep Space)
        if (preset === 'void') {
            this.scene.background = new THREE.Color('#080C14');
            addStars(280, 28, 58, ['#FFFFFF', '#E2E8F0', '#FDE68A', '#BAE6FD'], 0.06, 0.22);

            const planet = new THREE.Mesh(
                new THREE.IcosahedronGeometry(1.6, 2),
                new THREE.MeshBasicMaterial({ color: '#26314D' })
            );
            planet.position.set(-20, 10, -32);
            this.celestialGroup.add(planet);

            const moonlet = new THREE.Mesh(
                new THREE.IcosahedronGeometry(0.42, 1),
                new THREE.MeshBasicMaterial({ color: '#64748B' })
            );
            moonlet.position.set(-17.5, 11.8, -30);
            this.celestialGroup.add(moonlet);

        // 2. VIOLET DREAM NEBULA
        } else if (preset === 'nebula') {
            this.scene.background = new THREE.Color('#130924');
            addStars(300, 28, 58, ['#FFFFFF', '#F5D0FE', '#C4B5FD', '#67E8F9'], 0.07, 0.25);
            addNebulaPuffs(10, ['#C026D3', '#6366F1', '#06B6D4', '#EC4899', '#A855F7']);

        // 3. SOLAR HORIZON (Sun & Atmospheric Corona)
        } else if (preset === 'sunset') {
            this.scene.background = new THREE.Color('#1A0C16');
            addStars(190, 30, 58, ['#FEF3C7', '#FDBA74', '#FCA5A5'], 0.06, 0.20);

            const sunCore = new THREE.Mesh(
                new THREE.SphereGeometry(7.2, 32, 32),
                new THREE.MeshBasicMaterial({ color: '#F59E0B' })
            );
            sunCore.position.set(-18, -6, -40);
            this.celestialGroup.add(sunCore);

            const innerHalo = new THREE.Mesh(
                new THREE.SphereGeometry(10.5, 32, 32),
                new THREE.MeshBasicMaterial({ color: '#EA580C', transparent: true, opacity: 0.22, depthWrite: false })
            );
            innerHalo.position.copy(sunCore.position);
            this.celestialGroup.add(innerHalo);

            const outerHalo = new THREE.Mesh(
                new THREE.SphereGeometry(14.8, 32, 32),
                new THREE.MeshBasicMaterial({ color: '#BE185D', transparent: true, opacity: 0.10, depthWrite: false })
            );
            outerHalo.position.copy(sunCore.position);
            this.celestialGroup.add(outerHalo);

        // 4. EMERALD TITAN (Ringed Gas Giant)
        } else if (preset === 'emerald') {
            this.scene.background = new THREE.Color('#061718');
            addStars(250, 28, 58, ['#ECFDF5', '#6EE7B7', '#5EEAD4', '#FEF08A'], 0.06, 0.22);
            addNebulaPuffs(7, ['#0D9488', '#059669', '#0284C7']);

            const giantGroup = new THREE.Group();
            const giantBody = new THREE.Mesh(
                new THREE.IcosahedronGeometry(2.7, 3),
                new THREE.MeshBasicMaterial({ color: '#115E59' })
            );
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(3.7, 5.3, 48),
                new THREE.MeshBasicMaterial({ color: '#5EEAD4', side: THREE.DoubleSide, transparent: true, opacity: 0.45 })
            );
            ring.rotation.x = Math.PI * 0.38;
            ring.rotation.y = 0.25;
            giantGroup.add(giantBody);
            giantGroup.add(ring);
            giantGroup.position.set(22, 9, -36);
            this.celestialGroup.add(giantGroup);

        // 5. AURORA BOREALIS (Curved Polar Light Ribbons)
        } else if (preset === 'aurora') {
            this.scene.background = new THREE.Color('#07131F');
            addStars(270, 28, 58, ['#ECFDF5', '#A7F3D0', '#BAE6FD', '#E0E7FF'], 0.06, 0.22);

            // Layered translucent aurora bands
            const auroraColors = ['#10B981', '#06B6D4', '#8B5CF6'];
            for (let a = 0; a < 3; a++) {
                const auroraGeom = new THREE.CylinderGeometry(28 + a * 3.5, 30 + a * 3.5, 10 + a * 2.5, 36, 1, true, -1.2 + a * 0.2, 2.4);
                const auroraMat = new THREE.MeshBasicMaterial({
                    color: auroraColors[a],
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.13 + a * 0.03,
                    depthWrite: false
                });
                const ribbon = new THREE.Mesh(auroraGeom, auroraMat);
                ribbon.rotation.x = Math.PI * 0.22 + a * 0.08;
                ribbon.rotation.z = -0.3 + a * 0.15;
                ribbon.position.set(0, 14, -28);
                this.celestialGroup.add(ribbon);
            }

            const icyMoon = new THREE.Mesh(
                new THREE.IcosahedronGeometry(1.2, 2),
                new THREE.MeshBasicMaterial({ color: '#7DD3FC' })
            );
            icyMoon.position.set(-18, 16, -32);
            this.celestialGroup.add(icyMoon);

        // 6. GLACIAL COMET & NEPTUNE
        } else if (preset === 'comet') {
            this.scene.background = new THREE.Color('#051224');
            addStars(260, 28, 58, ['#E0F2FE', '#BAE6FD', '#7DD3FC', '#FFFFFF'], 0.06, 0.22);

            // Distant ice giant (Neptune)
            const neptune = new THREE.Mesh(
                new THREE.IcosahedronGeometry(2.3, 3),
                new THREE.MeshBasicMaterial({ color: '#0284C7' })
            );
            neptune.position.set(20, -7, -35);
            this.celestialGroup.add(neptune);

            // Great Comet Nucleus & Sweeping Tail
            const cometGroup = new THREE.Group();
            const nucleus = new THREE.Mesh(
                new THREE.SphereGeometry(0.55, 16, 16),
                new THREE.MeshBasicMaterial({ color: '#38BDF8' })
            );
            cometGroup.add(nucleus);

            const cometTailGeom = new THREE.ConeGeometry(1.8, 22, 16, 1, true);
            cometTailGeom.rotateX(Math.PI / 2);
            cometTailGeom.translate(0, 0, -11);
            const cometTailMat = new THREE.MeshBasicMaterial({
                color: '#BAE6FD',
                transparent: true,
                opacity: 0.28,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            const cometTail = new THREE.Mesh(cometTailGeom, cometTailMat);
            cometGroup.add(cometTail);

            cometGroup.position.set(-14, 18, -32);
            cometGroup.rotation.set(0.4, 0.6, -0.7);
            this.celestialGroup.add(cometGroup);

        // 7. CRIMSON SUPERNOVA
        } else if (preset === 'supernova') {
            this.scene.background = new THREE.Color('#1A080C');
            addStars(230, 28, 58, ['#FEE2E2', '#FCA5A5', '#F87171', '#FEF08A'], 0.06, 0.22);
            addNebulaPuffs(8, ['#EF4444', '#DC2626', '#F97316', '#7F1D1D'], 36, 11);

            // Expanding shockwave rings
            const shockwave1 = new THREE.Mesh(
                new THREE.RingGeometry(5.2, 6.8, 48),
                new THREE.MeshBasicMaterial({ color: '#EF4444', side: THREE.DoubleSide, transparent: true, opacity: 0.35, depthWrite: false })
            );
            shockwave1.rotation.set(0.6, 0.3, 0);
            shockwave1.position.set(-16, 8, -38);
            this.celestialGroup.add(shockwave1);

            const shockwave2 = new THREE.Mesh(
                new THREE.RingGeometry(8.0, 9.6, 48),
                new THREE.MeshBasicMaterial({ color: '#F97316', side: THREE.DoubleSide, transparent: true, opacity: 0.20, depthWrite: false })
            );
            shockwave2.position.copy(shockwave1.position);
            shockwave2.rotation.copy(shockwave1.rotation);
            this.celestialGroup.add(shockwave2);

            const redDwarf = new THREE.Mesh(
                new THREE.SphereGeometry(1.6, 24, 24),
                new THREE.MeshBasicMaterial({ color: '#B91C1C' })
            );
            redDwarf.position.copy(shockwave1.position);
            this.celestialGroup.add(redDwarf);

        // 8. GARGANTUA BLACK HOLE
        } else if (preset === 'blackhole') {
            this.scene.background = new THREE.Color('#040509');
            addStars(290, 28, 58, ['#FFFFFF', '#CBD5E1', '#FEF08A', '#FDE047'], 0.06, 0.22);

            const bhGroup = new THREE.Group();
            // Core event horizon (pitch black sphere)
            const horizon = new THREE.Mesh(
                new THREE.SphereGeometry(2.3, 32, 32),
                new THREE.MeshBasicMaterial({ color: '#000000' })
            );
            bhGroup.add(horizon);

            // Luminous golden accretion disk
            const disk = new THREE.Mesh(
                new THREE.RingGeometry(2.8, 6.4, 64),
                new THREE.MeshBasicMaterial({ color: '#F59E0B', side: THREE.DoubleSide, transparent: true, opacity: 0.65 })
            );
            disk.rotation.x = Math.PI * 0.36;
            disk.rotation.y = 0.22;
            bhGroup.add(disk);

            // Outer red/orange gradient corona
            const outerDisk = new THREE.Mesh(
                new THREE.RingGeometry(6.4, 9.8, 64),
                new THREE.MeshBasicMaterial({ color: '#DC2626', side: THREE.DoubleSide, transparent: true, opacity: 0.25 })
            );
            outerDisk.rotation.copy(disk.rotation);
            bhGroup.add(outerDisk);

            bhGroup.position.set(19, 10, -36);
            this.celestialGroup.add(bhGroup);

        // 9. THE ASTEROID BELT
        } else if (preset === 'asteroid') {
            this.scene.background = new THREE.Color('#0B0F19');
            addStars(240, 28, 58, ['#E2E8F0', '#CBD5E1', '#94A3B8', '#FDE68A'], 0.06, 0.20);

            // 40 Tumbling space rock asteroids in an orbital belt
            const rockGeom = new THREE.DodecahedronGeometry(1, 0);
            const rockCols = ['#475569', '#334155', '#64748B', '#1E293B'];

            for (let i = 0; i < 40; i++) {
                const angle = (i / 40) * Math.PI * 1.5 - 0.7;
                const dist = 32 + (rand() - 0.5) * 8;
                const rx = dist * Math.cos(angle);
                const ry = (rand() - 0.5) * 12 + 4;
                const rz = -dist * Math.sin(angle);

                const col = rockCols[Math.floor(rand() * rockCols.length)];
                const rock = new THREE.Mesh(rockGeom, new THREE.MeshBasicMaterial({ color: col }));
                rock.position.set(rx, ry, rz);
                const s = 0.35 + rand() * 1.1;
                rock.scale.set(s * (0.8 + rand() * 0.4), s, s * (0.8 + rand() * 0.4));
                rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
                this.celestialGroup.add(rock);
            }

        // 10. NEON SYNTHWAVE (Retro Cosmos)
        } else {
            this.scene.background = new THREE.Color('#110722');
            addStars(280, 28, 58, ['#F472B6', '#38BDF8', '#C084FC', '#FDE047'], 0.07, 0.24);

            // Retro Sun with horizontal stripes
            const sunGroup = new THREE.Group();
            const sunBody = new THREE.Mesh(
                new THREE.CircleGeometry(5.8, 36),
                new THREE.MeshBasicMaterial({ color: '#EC4899', side: THREE.DoubleSide })
            );
            sunGroup.add(sunBody);

            // Sliced horizontal bars
            for (let b = 0; b < 6; b++) {
                const barGeom = new THREE.PlaneGeometry(12, 0.22 + b * 0.12);
                const bar = new THREE.Mesh(
                    barGeom,
                    new THREE.MeshBasicMaterial({ color: '#110722', side: THREE.DoubleSide })
                );
                bar.position.set(0, -2.8 + b * 0.85, 0.02);
                sunGroup.add(bar);
            }

            sunGroup.position.set(-16, -4, -38);
            this.celestialGroup.add(sunGroup);

            // Binary electric stars
            const starCyan = new THREE.Mesh(
                new THREE.SphereGeometry(1.2, 16, 16),
                new THREE.MeshBasicMaterial({ color: '#06B6D4' })
            );
            starCyan.position.set(21, 14, -34);
            this.celestialGroup.add(starCyan);

            const starPink = new THREE.Mesh(
                new THREE.SphereGeometry(0.9, 16, 16),
                new THREE.MeshBasicMaterial({ color: '#F43F5E' })
            );
            starPink.position.set(23.8, 12.2, -32);
            this.celestialGroup.add(starPink);
        }
    }

    public update(dt: number): void {
        // Slow majestic background rotation
        this.group.rotation.y += 0.004 * dt;

        // Dynamic Shooting Star (Meteor) System
        this.shootingStarTimer += dt;
        if (!this.shootingStarActive) {
            if (this.shootingStarTimer >= this.shootingStarInterval) {
                this.triggerShootingStar();
            }
        } else {
            this.shootingStarLife += dt;
            const t = this.shootingStarLife / this.shootingStarDuration;
            if (t >= 1.0) {
                this.shootingStarActive = false;
                this.shootingStarMesh.visible = false;
                this.shootingStarTimer = 0;
                this.shootingStarInterval = 12 + Math.random() * 16; // Next meteor in 12-28s
            } else {
                this.shootingStarMesh.position.addScaledVector(this.shootingStarVelocity, dt);
                const alpha = Math.sin(t * Math.PI); // Smooth fade in and out
                const mat = this.shootingStarMesh.material as THREE.MeshBasicMaterial;
                mat.opacity = alpha * 0.85;
            }
        }
    }

    private triggerShootingStar(): void {
        this.shootingStarActive = true;
        this.shootingStarLife = 0;
        this.shootingStarDuration = 0.55 + Math.random() * 0.35;

        // Spawn high in the sky and shoot diagonally
        const angle = Math.random() * Math.PI * 2;
        const dist = 32 + Math.random() * 8;
        this.shootingStarStart.set(
            dist * Math.cos(angle),
            16 + Math.random() * 12,
            -dist * Math.sin(angle)
        );

        this.shootingStarMesh.position.copy(this.shootingStarStart);

        // Direction: downwards and across
        this.shootingStarVelocity.set(
            (Math.random() - 0.5) * 22,
            -18 - Math.random() * 10,
            (Math.random() - 0.5) * 22
        );

        // Rotate mesh along velocity vector
        const lookTarget = this.shootingStarMesh.position.clone().add(this.shootingStarVelocity);
        this.shootingStarMesh.lookAt(lookTarget);

        this.shootingStarMesh.visible = true;
    }
}
