import { Moon } from '../entities/Moon';
import { Rover } from '../entities/Rover';
import { SweeperSystem } from '../systems/SweeperSystem';
import { SoundManager } from '../audio/SoundManager';
import { CameraController } from '../core/CameraController';
import { ConfigManager } from '../core/Config';

export class HUD {
    private moon: Moon;
    private rover: Rover;
    private sweeper: SweeperSystem;
    private sound: SoundManager;
    private cameraCtrl: CameraController;

    // Elements
    private cleanPctEl = document.getElementById('hud-clean-pct');
    private cleanBarEl = document.getElementById('hud-clean-bar');
    private tankValEl = document.getElementById('hud-tank-val');
    private tankBarEl = document.getElementById('hud-tank-bar');
    private moonBadgeEl = document.getElementById('hud-moon-badge');
    private victoryBannerEl = document.getElementById('victory-banner');
    private toastEl = document.getElementById('toast');

    // Tab buttons & panes
    private tabBtns: NodeListOf<HTMLButtonElement>;
    private tabPanes: { [key: string]: HTMLElement | null } = {};

    // Sliders & inputs
    private inpSpeed = document.getElementById('inp-speed') as HTMLInputElement | null;
    private valSpeed = document.getElementById('val-speed');
    private inpAccel = document.getElementById('inp-accel') as HTMLInputElement | null;
    private valAccel = document.getElementById('val-accel');
    private inpTurn = document.getElementById('inp-turn') as HTMLInputElement | null;
    private valTurn = document.getElementById('val-turn');
    private inpWidth = document.getElementById('inp-width') as HTMLInputElement | null;
    private valWidth = document.getElementById('val-width');
    private inpPower = document.getElementById('inp-power') as HTMLInputElement | null;
    private valPower = document.getElementById('val-power');
    private inpSuspPitch = document.getElementById('inp-susp-pitch') as HTMLInputElement | null;
    private valSuspPitch = document.getElementById('val-susp-pitch');
    private inpSuspRoll = document.getElementById('inp-susp-roll') as HTMLInputElement | null;
    private valSuspRoll = document.getElementById('val-susp-roll');
    private inpTrailFade = document.getElementById('inp-trail-fade') as HTMLInputElement | null;
    private valTrailFade = document.getElementById('val-trail-fade');

    // Camera sliders
    private inpCamDist = document.getElementById('inp-cam-dist') as HTMLInputElement | null;
    private valCamDist = document.getElementById('val-cam-dist');
    private inpCamHeight = document.getElementById('inp-cam-height') as HTMLInputElement | null;
    private valCamHeight = document.getElementById('val-cam-height');
    private inpCamPitch = document.getElementById('inp-cam-pitch') as HTMLInputElement | null;
    private valCamPitch = document.getElementById('val-cam-pitch');
    private inpCamFov = document.getElementById('inp-cam-fov') as HTMLInputElement | null;
    private valCamFov = document.getElementById('val-cam-fov');
    private inpCamSmooth = document.getElementById('inp-cam-smooth') as HTMLInputElement | null;
    private valCamSmooth = document.getElementById('val-cam-smooth');
    private inpCamIdle = document.getElementById('inp-cam-idle') as HTMLInputElement | null;
    private valCamIdle = document.getElementById('val-cam-idle');
    private btnTestIdleCam = document.getElementById('btn-test-idle-cam');

    // Moon sliders
    private inpMoonScale = document.getElementById('inp-moon-scale') as HTMLInputElement | null;
    private valMoonScale = document.getElementById('val-moon-scale');
    private inpDirtHeight = document.getElementById('inp-dirt-height') as HTMLInputElement | null;
    private valDirtHeight = document.getElementById('val-dirt-height');
    private inpSoftness = document.getElementById('inp-softness') as HTMLInputElement | null;
    private valSoftness = document.getElementById('val-softness');
    private inpShadowBright = document.getElementById('inp-shadow-bright') as HTMLInputElement | null;
    private valShadowBright = document.getElementById('val-shadow-bright');
    private inpIntensity = document.getElementById('inp-intensity') as HTMLInputElement | null;
    private valIntensity = document.getElementById('val-intensity');
    private selSpacePreset = document.getElementById('sel-space-preset') as HTMLSelectElement | null;
    private valSpacePreset = document.getElementById('val-space-preset');

    // Tank debug & tuning controls
    private inpDebugTankFill = document.getElementById('inp-debug-tank-fill') as HTMLInputElement | null;
    private valDebugTankFill = document.getElementById('val-debug-tank-fill');
    private inpCartCount = document.getElementById('inp-cart-count') as HTMLInputElement | null;
    private valCartCount = document.getElementById('val-cart-count');
    private inpCartSpacing = document.getElementById('inp-cart-spacing') as HTMLInputElement | null;
    private valCartSpacing = document.getElementById('val-cart-spacing');
    private inpTankScale = document.getElementById('inp-tank-scale') as HTMLInputElement | null;
    private valTankScale = document.getElementById('val-tank-scale');
    private inpTankLength = document.getElementById('inp-tank-length') as HTMLInputElement | null;
    private valTankLength = document.getElementById('val-tank-length');
    private inpTankCapacity = document.getElementById('inp-tank-capacity') as HTMLInputElement | null;
    private valTankCapacity = document.getElementById('val-tank-capacity');
    private inpTankSpeed = document.getElementById('inp-tank-speed') as HTMLInputElement | null;
    private valTankSpeed = document.getElementById('val-tank-speed');
    private inpTankGlow = document.getElementById('inp-tank-glow') as HTMLInputElement | null;
    private valTankGlow = document.getElementById('val-tank-glow');
    private inpTankGlass = document.getElementById('inp-tank-glass') as HTMLInputElement | null;
    private valTankGlass = document.getElementById('val-tank-glass');
    private selTankColor = document.getElementById('sel-tank-color') as HTMLSelectElement | null;
    private valTankColor = document.getElementById('val-tank-color');
    private btnFill100 = document.getElementById('btn-fill-100');
    private btnFill50 = document.getElementById('btn-fill-50');
    private btnFill0 = document.getElementById('btn-fill-0');
    private isUserDraggingTankFill = false;

    // Toggles & Actions
    private btnToggleTrails = document.getElementById('btn-toggle-trails');
    private btnToggleCam = document.getElementById('btn-toggle-cam');
    private btnToggleComfort = document.getElementById('btn-toggle-comfort');
    private iconSoundEl = document.getElementById('icon-sound');
    private txtJsonPreview = document.getElementById('txt-json-preview') as HTMLTextAreaElement | null;

    private toastTimer: number | null = null;
    private victoryShown = false;

    // Callbacks
    public onRandomMoon?: () => void;
    public onSpacePresetChange?: (preset: string) => void;

    constructor(
        moon: Moon,
        rover: Rover,
        sweeper: SweeperSystem,
        sound: SoundManager,
        cameraCtrl: CameraController
    ) {
        this.moon = moon;
        this.rover = rover;
        this.sweeper = sweeper;
        this.sound = sound;
        this.cameraCtrl = cameraCtrl;

        this.tabBtns = document.querySelectorAll('.tab-btn');
        this.tabPanes = {
            probe: document.getElementById('tab-probe'),
            camera: document.getElementById('tab-camera'),
            moon: document.getElementById('tab-moon'),
            tank: document.getElementById('tab-tank'),
            save: document.getElementById('tab-save')
        };

        this.setupTabs();
        this.setupControls();
        this.syncAllUIFromConfig();
    }

    private setupTabs(): void {
        this.tabBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
                const tabKey = btn.dataset.tab;
                if (!tabKey) return;

                this.tabBtns.forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');

                Object.keys(this.tabPanes).forEach((key) => {
                    const pane = this.tabPanes[key];
                    if (pane) {
                        if (key === tabKey) {
                            pane.classList.remove('hidden');
                        } else {
                            pane.classList.add('hidden');
                        }
                    }
                });

                if (tabKey === 'save') {
                    this.updateJsonPreview();
                }
            });
        });

        // Toggle Minimize / Expand
        const toggleBtn = document.getElementById('btn-toggle-panel');
        const tuningBody = document.getElementById('tuning-body');
        const toggleIcon = document.getElementById('toggle-icon');
        let isMinimized = false;

        toggleBtn?.addEventListener('click', () => {
            isMinimized = !isMinimized;
            if (isMinimized) {
                tuningBody?.classList.add('hidden');
                if (toggleIcon) toggleIcon.textContent = '+';
            } else {
                tuningBody?.classList.remove('hidden');
                if (toggleIcon) toggleIcon.textContent = '−';
            }
        });
    }

    private setupControls(): void {
        const triggerRandom = () => {
            this.victoryShown = false;
            this.victoryBannerEl?.classList.add('hidden');
            if (this.onRandomMoon) this.onRandomMoon();
        };

        document.getElementById('btn-random-moon')?.addEventListener('click', triggerRandom);
        document.getElementById('btn-random-moon-tab')?.addEventListener('click', triggerRandom);
        document.getElementById('btn-victory-next')?.addEventListener('click', triggerRandom);
        document.getElementById('btn-close-victory')?.addEventListener('click', () => {
            this.victoryBannerEl?.classList.add('hidden');
        });

        // 1. Probe & Sweeper Sliders
        this.inpSpeed?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.probeSpeed = val;
            ConfigManager.saveToStorage();
            this.rover.applyConfig();
            if (this.valSpeed) this.valSpeed.textContent = `${val.toFixed(2)}x`;
            this.updateJsonPreview();
        });

        this.inpAccel?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.accelRate = val;
            ConfigManager.saveToStorage();
            if (this.valAccel) this.valAccel.textContent = val.toFixed(2);
            this.updateJsonPreview();
        });

        this.inpTurn?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.turnRate = val;
            ConfigManager.saveToStorage();
            if (this.valTurn) this.valTurn.textContent = val.toFixed(2);
            this.updateJsonPreview();
        });

        this.inpWidth?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.sweeperWidth = val;
            ConfigManager.saveToStorage();
            this.rover.applyConfig();
            if (this.valWidth) this.valWidth.textContent = val.toFixed(2);
            this.updateJsonPreview();
        });

        this.inpPower?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.brushPower = val;
            ConfigManager.saveToStorage();
            this.rover.applyConfig();
            if (this.valPower) this.valPower.textContent = `${Math.round(val * 100)}%`;
            this.updateJsonPreview();
        });

        this.inpSuspPitch?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.suspensionPitch = val;
            ConfigManager.saveToStorage();
            if (this.valSuspPitch) this.valSuspPitch.textContent = `${val.toFixed(2)}x`;
            this.updateJsonPreview();
        });

        this.inpSuspRoll?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.suspensionRoll = val;
            ConfigManager.saveToStorage();
            if (this.valSuspRoll) this.valSuspRoll.textContent = `${val.toFixed(2)}x`;
            this.updateJsonPreview();
        });

        this.inpTrailFade?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.trailFadeDuration = val;
            ConfigManager.saveToStorage();
            if (this.valTrailFade) this.valTrailFade.textContent = `${val.toFixed(1)}s`;
            this.updateJsonPreview();
        });

        // 2. Camera Sliders
        this.inpCamDist?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.camDistance = val;
            ConfigManager.saveToStorage();
            this.cameraCtrl.applyConfig();
            if (this.valCamDist) this.valCamDist.textContent = val.toFixed(2);
            this.updateJsonPreview();
        });

        this.inpCamHeight?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.camHeight = val;
            ConfigManager.saveToStorage();
            this.cameraCtrl.applyConfig();
            if (this.valCamHeight) this.valCamHeight.textContent = val.toFixed(2);
            this.updateJsonPreview();
        });

        this.inpCamPitch?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.camPitch = val;
            ConfigManager.saveToStorage();
            this.cameraCtrl.applyConfig();
            if (this.valCamPitch) this.valCamPitch.textContent = val.toFixed(2);
            this.updateJsonPreview();
        });

        this.inpCamFov?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.camFov = val;
            ConfigManager.saveToStorage();
            this.cameraCtrl.applyConfig();
            if (this.valCamFov) this.valCamFov.textContent = `${Math.round(val)}°`;
            this.updateJsonPreview();
        });

        this.inpCamSmooth?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.camSmoothPos = val;
            ConfigManager.current.camSmoothLook = val * 1.5;
            ConfigManager.saveToStorage();
            if (this.valCamSmooth) this.valCamSmooth.textContent = val.toFixed(1);
            this.updateJsonPreview();
        });

        this.inpCamIdle?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.camIdleSeconds = val;
            ConfigManager.saveToStorage();
            if (this.valCamIdle) this.valCamIdle.textContent = `${Math.round(val)}s`;
            this.updateJsonPreview();
        });

        this.btnTestIdleCam?.addEventListener('click', () => {
            this.cameraCtrl.triggerIdleCinematic();
            this.showToast('Orbit Bulan Dimulai');
        });

        // 3. Moon Sliders
        this.inpMoonScale?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.moonScale = val;
            ConfigManager.saveToStorage();
            this.moon.applyShaderConfig();
            this.rover.applyConfig();
            if (this.valMoonScale) this.valMoonScale.textContent = `${val.toFixed(2)}x`;
            this.updateJsonPreview();
        });

        this.inpDirtHeight?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.dirtHeight = val;
            ConfigManager.saveToStorage();
            this.moon.applyShaderConfig();
            if (this.valDirtHeight) this.valDirtHeight.textContent = val.toFixed(3);
            this.updateJsonPreview();
        });

        this.inpSoftness?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.softness = val;
            ConfigManager.saveToStorage();
            this.moon.applyShaderConfig();
            if (this.valSoftness) this.valSoftness.textContent = val.toFixed(2);
            this.updateJsonPreview();
        });

        this.inpShadowBright?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.shadowBrightness = val;
            ConfigManager.saveToStorage();
            this.moon.applyShaderConfig();
            if (this.valShadowBright) this.valShadowBright.textContent = val.toFixed(2);
            this.updateJsonPreview();
        });

        this.inpIntensity?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.intensity = val;
            ConfigManager.saveToStorage();
            this.moon.applyShaderConfig();
            if (this.valIntensity) this.valIntensity.textContent = val.toFixed(2);
            this.updateJsonPreview();
        });

        this.selSpacePreset?.addEventListener('change', (e) => {
            const val = (e.target as HTMLSelectElement).value;
            ConfigManager.current.spacePreset = val;
            ConfigManager.saveToStorage();
            if (this.valSpacePreset) {
                this.valSpacePreset.textContent = val === 'auto' ? 'Otomatis' : val;
            }
            this.updateJsonPreview();
            if (this.onSpacePresetChange) {
                this.onSpacePresetChange(val);
            }
            this.showToast(`Pemandangan: ${val === 'auto' ? 'Otomatis' : val}`);
        });

        // 4. Tank Debug & Tuning Sliders / Buttons
        this.btnFill100?.addEventListener('click', () => {
            this.rover.setDustPercent(100);
            this.sound.playUpgrade();
            if (this.valDebugTankFill) this.valDebugTankFill.textContent = '100%';
            if (this.inpDebugTankFill) this.inpDebugTankFill.value = '100';
            this.showToast('Tangki diisi penuh (100%)');
        });

        this.btnFill50?.addEventListener('click', () => {
            this.rover.setDustPercent(50);
            this.sound.playCoin();
            if (this.valDebugTankFill) this.valDebugTankFill.textContent = '50%';
            if (this.inpDebugTankFill) this.inpDebugTankFill.value = '50';
            this.showToast('Tangki diisi separuh (50%)');
        });

        this.btnFill0?.addEventListener('click', () => {
            this.rover.setDustPercent(0);
            this.sound.playDepositWhoosh();
            if (this.valDebugTankFill) this.valDebugTankFill.textContent = '0%';
            if (this.inpDebugTankFill) this.inpDebugTankFill.value = '0';
            this.showToast('Tangki dikosongkan (0%)');
        });

        this.inpDebugTankFill?.addEventListener('mousedown', () => {
            this.isUserDraggingTankFill = true;
        });
        this.inpDebugTankFill?.addEventListener('touchstart', () => {
            this.isUserDraggingTankFill = true;
        });
        this.inpDebugTankFill?.addEventListener('input', (e) => {
            this.isUserDraggingTankFill = true;
            const pct = parseFloat((e.target as HTMLInputElement).value);
            this.rover.setDustPercent(pct);
            if (this.valDebugTankFill) this.valDebugTankFill.textContent = `${Math.round(pct)}%`;
        });
        this.inpDebugTankFill?.addEventListener('change', () => {
            this.isUserDraggingTankFill = false;
        });
        this.inpDebugTankFill?.addEventListener('mouseup', () => {
            this.isUserDraggingTankFill = false;
        });
        this.inpDebugTankFill?.addEventListener('touchend', () => {
            this.isUserDraggingTankFill = false;
        });

        this.inpCartCount?.addEventListener('input', (e) => {
            const val = parseInt((e.target as HTMLInputElement).value, 10);
            ConfigManager.current.cartCount = val;
            ConfigManager.saveToStorage();
            this.rover.applyConfig();
            if (this.valCartCount) this.valCartCount.textContent = `${val} Cart${val > 1 ? 's' : ''}`;
            this.showToast(`Jumlah cart trailer: ${val}`);
            this.updateJsonPreview();
        });

        this.inpCartSpacing?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.cartSpacing = val;
            ConfigManager.saveToStorage();
            this.rover.applyConfig();
            if (this.valCartSpacing) this.valCartSpacing.textContent = `${val.toFixed(2)}x`;
            this.updateJsonPreview();
        });

        this.inpTankScale?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.tankScale = val;
            ConfigManager.saveToStorage();
            this.rover.applyConfig();
            if (this.valTankScale) this.valTankScale.textContent = `${val.toFixed(2)}x`;
            this.updateJsonPreview();
        });

        this.inpTankLength?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.tankLength = val;
            ConfigManager.saveToStorage();
            this.rover.applyConfig();
            if (this.valTankLength) this.valTankLength.textContent = `${val.toFixed(2)}x`;
            this.updateJsonPreview();
        });

        this.inpTankCapacity?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.tankCapacity = val;
            ConfigManager.saveToStorage();
            this.rover.applyConfig();
            if (this.valTankCapacity) this.valTankCapacity.textContent = Math.round(val).toString();
            this.updateJsonPreview();
        });

        this.inpTankSpeed?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.tankFillSpeed = val;
            ConfigManager.saveToStorage();
            if (this.valTankSpeed) this.valTankSpeed.textContent = `${val.toFixed(2)}x`;
            this.updateJsonPreview();
        });

        this.inpTankGlow?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.tankGlowIntensity = val;
            ConfigManager.saveToStorage();
            this.rover.applyConfig();
            if (this.valTankGlow) this.valTankGlow.textContent = val.toFixed(2);
            this.updateJsonPreview();
        });

        this.inpTankGlass?.addEventListener('input', (e) => {
            const val = parseFloat((e.target as HTMLInputElement).value);
            ConfigManager.current.tankGlassOpacity = val;
            ConfigManager.saveToStorage();
            this.rover.applyConfig();
            if (this.valTankGlass) this.valTankGlass.textContent = val.toFixed(2);
            this.updateJsonPreview();
        });

        this.selTankColor?.addEventListener('change', (e) => {
            const val = (e.target as HTMLSelectElement).value;
            ConfigManager.current.tankColorStyle = val;
            ConfigManager.saveToStorage();
            this.rover.applyConfig();
            if (this.valTankColor) {
                const colorLabels: { [k: string]: string } = {
                    palette: 'Sesuai Bulan',
                    cyan: 'Cyan Plasma',
                    gold: 'Radiant Gold',
                    magenta: 'Magenta Stardust',
                    emerald: 'Emerald Auroral',
                    amethyst: 'Amethyst Cosmic'
                };
                this.valTankColor.textContent = colorLabels[val] || val;
            }
            this.updateJsonPreview();
        });

        // 4. Action Toggles
        this.btnToggleTrails?.addEventListener('click', () => {
            ConfigManager.current.trailsEnabled = !ConfigManager.current.trailsEnabled;
            ConfigManager.saveToStorage();
            if (this.btnToggleTrails) {
                if (ConfigManager.current.trailsEnabled) {
                    this.btnToggleTrails.textContent = 'Jejak: Aktif';
                    this.btnToggleTrails.className = 'btn btn-toggle-active';
                } else {
                    this.btnToggleTrails.textContent = 'Jejak: Nonaktif';
                    this.btnToggleTrails.className = 'btn btn-toggle-inactive';
                    (this.moon.geometry.attributes.aTrail.array as Float32Array).fill(0);
                    this.moon.geometry.attributes.aTrail.needsUpdate = true;
                    this.moon.updateVertexHeights();
                }
            }
            this.updateJsonPreview();
        });

        this.btnToggleComfort?.addEventListener('click', () => {
            const nextMode = !ConfigManager.current.comfortMode;
            ConfigManager.current.comfortMode = nextMode;
            ConfigManager.current.lazyFollow = nextMode;

            if (nextMode) {
                // Apply optimal comfort preset
                ConfigManager.current.camHeight = 0.85;
                ConfigManager.current.camPitch = 0.85;
                ConfigManager.current.camFov = 54;
                ConfigManager.current.camDistance = 2.50;
                ConfigManager.current.camSmoothPos = 6.0;
                ConfigManager.current.camSmoothLook = 7.5;
                this.showToast('Mode Anti-Pusing Aktif: Sudut Nyaman & Bebas Goncangan');
            } else {
                // Legacy dynamic chase
                ConfigManager.current.camHeight = 0.40;
                ConfigManager.current.camPitch = 1.20;
                ConfigManager.current.camFov = 45;
                ConfigManager.current.camDistance = 2.40;
                ConfigManager.current.camSmoothPos = 12.0;
                ConfigManager.current.camSmoothLook = 18.0;
                this.showToast('Mode Dinamis Lama Aktif');
            }

            ConfigManager.saveToStorage();
            this.cameraCtrl.applyConfig();
            this.syncAllUIFromConfig();
            this.updateJsonPreview();
        });

        this.btnToggleCam?.addEventListener('click', () => {
            ConfigManager.current.followCamera = !ConfigManager.current.followCamera;
            ConfigManager.saveToStorage();
            if (this.btnToggleCam) {
                if (ConfigManager.current.followCamera) {
                    this.btnToggleCam.textContent = 'Kamera: Ikuti';
                    this.btnToggleCam.className = 'btn btn-toggle-cyan';
                } else {
                    this.btnToggleCam.textContent = 'Kamera: Orbit';
                    this.btnToggleCam.className = 'btn btn-toggle-inactive';
                }
            }
            this.showToast(ConfigManager.current.followCamera ? 'Kamera Mengikuti Rover' : 'Kamera Bebas Orbit');
            this.updateJsonPreview();
        });

        document.getElementById('btn-reset-cam')?.addEventListener('click', () => {
            this.cameraCtrl.resetCamera();
            this.showToast('Sudut Kamera Direset');
        });

        document.getElementById('btn-refill-dirt')?.addEventListener('click', () => {
            this.moon.refillDirt();
            this.sweeper.update(0.016, true);
            this.victoryShown = false;
            this.victoryBannerEl?.classList.add('hidden');
            this.showToast('Lapisan Debu Diisi Ulang');
        });

        document.getElementById('btn-toggle-sound')?.addEventListener('click', () => {
            const enabled = this.sound.toggle();
            ConfigManager.current.soundEnabled = enabled;
            ConfigManager.saveToStorage();
            if (this.iconSoundEl) {
                this.iconSoundEl.textContent = enabled ? 'Suara: On' : 'Suara: Off';
            }
            this.showToast(enabled ? 'Suara Diaktifkan' : 'Suara Dimatikan');
            this.updateJsonPreview();
        });

        // 5. JSON Import / Export & Reset
        document.getElementById('btn-copy-json')?.addEventListener('click', () => {
            const payload = ConfigManager.exportJSON();
            navigator.clipboard.writeText(payload).then(() => {
                this.showToast('JSON berhasil disalin ke clipboard!');
            }).catch(() => {
                this.showToast('Gagal menyalin, periksa izin browser.');
            });
        });

        document.getElementById('btn-download-json')?.addEventListener('click', () => {
            const payload = ConfigManager.exportJSON();
            const blob = new Blob([payload], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lunar-sweeper-settings-${this.moon.seed}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.showToast('Berkas settings .json diunduh!');
        });

        document.getElementById('btn-reset-default')?.addEventListener('click', () => {
            ConfigManager.resetToDefault();
            this.syncAllUIFromConfig();
            this.rover.applyConfig();
            this.cameraCtrl.applyConfig();
            this.moon.applyShaderConfig();
            this.showToast('Pengaturan dikembalikan ke bawaan!');
        });

        document.getElementById('btn-apply-pasted-json')?.addEventListener('click', () => {
            if (!this.txtJsonPreview) return;
            const raw = this.txtJsonPreview.value.trim();
            if (ConfigManager.importJSON(raw)) {
                this.syncAllUIFromConfig();
                this.rover.applyConfig();
                this.cameraCtrl.applyConfig();
                this.moon.applyShaderConfig();
                this.showToast('Pengaturan JSON berhasil diterapkan!');
            } else {
                this.showToast('Format JSON tidak valid!');
            }
        });

        // 6. Manual Empty / Dump Vacuum Tank (Button & E Key)
        document.getElementById('btn-empty-tank')?.addEventListener('click', () => {
            this.dumpVacuumTank();
        });

        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'e' && !e.repeat) {
                const tag = (document.activeElement?.tagName || '').toLowerCase();
                if (tag !== 'input' && tag !== 'textarea') {
                    this.dumpVacuumTank();
                }
            }
        });
    }

    public syncAllUIFromConfig(): void {
        const cfg = ConfigManager.current;

        // Probe
        if (this.inpSpeed) this.inpSpeed.value = cfg.probeSpeed.toString();
        if (this.valSpeed) this.valSpeed.textContent = `${cfg.probeSpeed.toFixed(2)}x`;
        if (this.inpAccel) this.inpAccel.value = cfg.accelRate.toString();
        if (this.valAccel) this.valAccel.textContent = cfg.accelRate.toFixed(2);
        if (this.inpTurn) this.inpTurn.value = cfg.turnRate.toString();
        if (this.valTurn) this.valTurn.textContent = cfg.turnRate.toFixed(2);
        if (this.inpWidth) this.inpWidth.value = cfg.sweeperWidth.toString();
        if (this.valWidth) this.valWidth.textContent = cfg.sweeperWidth.toFixed(2);
        if (this.inpPower) this.inpPower.value = cfg.brushPower.toString();
        if (this.valPower) this.valPower.textContent = `${Math.round(cfg.brushPower * 100)}%`;
        if (this.inpSuspPitch) this.inpSuspPitch.value = cfg.suspensionPitch.toString();
        if (this.valSuspPitch) this.valSuspPitch.textContent = `${cfg.suspensionPitch.toFixed(2)}x`;
        if (this.inpSuspRoll) this.inpSuspRoll.value = cfg.suspensionRoll.toString();
        if (this.valSuspRoll) this.valSuspRoll.textContent = `${cfg.suspensionRoll.toFixed(2)}x`;
        if (this.inpTrailFade) this.inpTrailFade.value = (cfg.trailFadeDuration || 4.5).toString();
        if (this.valTrailFade) this.valTrailFade.textContent = `${(cfg.trailFadeDuration || 4.5).toFixed(1)}s`;

        // Camera
        if (this.inpCamDist) this.inpCamDist.value = cfg.camDistance.toString();
        if (this.valCamDist) this.valCamDist.textContent = cfg.camDistance.toFixed(2);
        if (this.inpCamHeight) this.inpCamHeight.value = cfg.camHeight.toString();
        if (this.valCamHeight) this.valCamHeight.textContent = cfg.camHeight.toFixed(2);
        if (this.inpCamPitch) this.inpCamPitch.value = cfg.camPitch.toString();
        if (this.valCamPitch) this.valCamPitch.textContent = cfg.camPitch.toFixed(2);
        if (this.inpCamFov) this.inpCamFov.value = cfg.camFov.toString();
        if (this.valCamFov) this.valCamFov.textContent = `${Math.round(cfg.camFov)}°`;
        if (this.inpCamSmooth) this.inpCamSmooth.value = cfg.camSmoothPos.toString();
        if (this.valCamSmooth) this.valCamSmooth.textContent = cfg.camSmoothPos.toFixed(1);
        const idleSec = cfg.camIdleSeconds !== undefined ? cfg.camIdleSeconds : 25;
        if (this.inpCamIdle) this.inpCamIdle.value = idleSec.toString();
        if (this.valCamIdle) this.valCamIdle.textContent = `${Math.round(idleSec)}s`;

        // Moon
        if (this.inpMoonScale) this.inpMoonScale.value = cfg.moonScale.toString();
        if (this.valMoonScale) this.valMoonScale.textContent = `${cfg.moonScale.toFixed(2)}x`;
        if (this.inpDirtHeight) this.inpDirtHeight.value = cfg.dirtHeight.toString();
        if (this.valDirtHeight) this.valDirtHeight.textContent = cfg.dirtHeight.toFixed(3);
        if (this.inpSoftness) this.inpSoftness.value = cfg.softness.toString();
        if (this.valSoftness) this.valSoftness.textContent = cfg.softness.toFixed(2);
        if (this.inpShadowBright) this.inpShadowBright.value = cfg.shadowBrightness.toString();
        if (this.valShadowBright) this.valShadowBright.textContent = cfg.shadowBrightness.toFixed(2);
        if (this.inpIntensity) this.inpIntensity.value = cfg.intensity.toString();
        if (this.valIntensity) this.valIntensity.textContent = cfg.intensity.toFixed(2);
        if (this.selSpacePreset) this.selSpacePreset.value = cfg.spacePreset || 'auto';
        if (this.valSpacePreset) this.valSpacePreset.textContent = (!cfg.spacePreset || cfg.spacePreset === 'auto') ? 'Otomatis' : cfg.spacePreset;

        // Tank & Vacuum
        if (this.inpCartCount) this.inpCartCount.value = (cfg.cartCount || 1).toString();
        if (this.valCartCount) {
            const count = cfg.cartCount || 1;
            this.valCartCount.textContent = `${count} Cart${count > 1 ? 's' : ''}`;
        }
        if (this.inpCartSpacing) this.inpCartSpacing.value = (cfg.cartSpacing || 1.0).toString();
        if (this.valCartSpacing) this.valCartSpacing.textContent = `${(cfg.cartSpacing || 1.0).toFixed(2)}x`;
        if (this.inpTankScale) this.inpTankScale.value = (cfg.tankScale || 1.0).toString();
        if (this.valTankScale) this.valTankScale.textContent = `${(cfg.tankScale || 1.0).toFixed(2)}x`;
        if (this.inpTankLength) this.inpTankLength.value = (cfg.tankLength || 1.0).toString();
        if (this.valTankLength) this.valTankLength.textContent = `${(cfg.tankLength || 1.0).toFixed(2)}x`;
        if (this.inpTankCapacity) this.inpTankCapacity.value = (cfg.tankCapacity || 100).toString();
        if (this.valTankCapacity) this.valTankCapacity.textContent = (cfg.tankCapacity || 100).toString();
        if (this.inpTankSpeed) this.inpTankSpeed.value = (cfg.tankFillSpeed || 1.0).toString();
        if (this.valTankSpeed) this.valTankSpeed.textContent = `${(cfg.tankFillSpeed || 1.0).toFixed(2)}x`;
        if (this.inpTankGlow) this.inpTankGlow.value = (cfg.tankGlowIntensity ?? 0.65).toString();
        if (this.valTankGlow) this.valTankGlow.textContent = (cfg.tankGlowIntensity ?? 0.65).toFixed(2);
        if (this.inpTankGlass) this.inpTankGlass.value = (cfg.tankGlassOpacity ?? 0.28).toString();
        if (this.valTankGlass) this.valTankGlass.textContent = (cfg.tankGlassOpacity ?? 0.28).toFixed(2);
        if (this.selTankColor) this.selTankColor.value = cfg.tankColorStyle || 'palette';
        if (this.valTankColor) {
            const colorLabels: { [k: string]: string } = {
                palette: 'Sesuai Bulan',
                cyan: 'Cyan Plasma',
                gold: 'Radiant Gold',
                magenta: 'Magenta Stardust',
                emerald: 'Emerald Auroral',
                amethyst: 'Amethyst Cosmic'
            };
            this.valTankColor.textContent = colorLabels[cfg.tankColorStyle || 'palette'] || 'Sesuai Bulan';
        }

        // Buttons state
        if (this.btnToggleComfort) {
            if (cfg.comfortMode) {
                this.btnToggleComfort.textContent = 'Mode Anti-Pusing: Aktif';
                this.btnToggleComfort.className = 'btn btn-toggle-cyan w-full mb-1 py-2 text-xs font-bold tracking-wide';
            } else {
                this.btnToggleComfort.textContent = 'Mode Dinamis (Lama): Aktif';
                this.btnToggleComfort.className = 'btn btn-dark w-full mb-1 py-2 text-xs font-bold tracking-wide';
            }
        }
        if (this.btnToggleTrails) {
            this.btnToggleTrails.textContent = cfg.trailsEnabled ? 'Jejak: Aktif' : 'Jejak: Nonaktif';
            this.btnToggleTrails.className = cfg.trailsEnabled ? 'btn btn-toggle-active' : 'btn btn-toggle-inactive';
        }
        if (this.btnToggleCam) {
            this.btnToggleCam.textContent = cfg.followCamera ? 'Kamera: Ikuti' : 'Kamera: Orbit';
            this.btnToggleCam.className = cfg.followCamera ? 'btn btn-toggle-cyan' : 'btn btn-toggle-inactive';
        }
        if (this.iconSoundEl) {
            this.iconSoundEl.textContent = cfg.soundEnabled ? 'Suara: On' : 'Suara: Off';
        }

        if (this.moonBadgeEl) {
            this.moonBadgeEl.textContent = `#${this.moon.seed} • ${this.moon.currentPalette.name}`;
        }

        this.updateJsonPreview();
    }

    public updateJsonPreview(): void {
        if (this.txtJsonPreview) {
            this.txtJsonPreview.value = ConfigManager.exportJSON();
        }
    }

    public dumpVacuumTank(): void {
        if (this.rover.stats.currentDust > 0) {
            this.rover.stats.currentDust = 0;
            this.sound.playDepositWhoosh();
            this.showToast('Tangki vakum dikosongkan.');
        } else {
            this.showToast('Tangki sudah kosong.');
        }
    }

    public update(cleanPct: number): void {
        if (this.cleanPctEl) {
            this.cleanPctEl.textContent = `${cleanPct.toFixed(1)}%`;
        }
        if (this.cleanBarEl) {
            this.cleanBarEl.style.width = `${cleanPct.toFixed(1)}%`;
        }

        if (this.tankValEl) {
            const cur = Math.floor(this.rover.stats.currentDust);
            const cap = this.rover.stats.tankCapacity;
            if (cur >= cap) {
                this.tankValEl.textContent = `${cap} / ${cap} kg (PENUH!)`;
                this.tankValEl.className = 'value yellow-text font-bold';
            } else {
                this.tankValEl.textContent = `${cur} / ${cap} kg`;
                this.tankValEl.className = 'value cyan-text';
            }
        }
        if (this.tankBarEl) {
            const tankPct = Math.min(100, (this.rover.stats.currentDust / this.rover.stats.tankCapacity) * 100);
            this.tankBarEl.style.width = `${tankPct.toFixed(1)}%`;
            if (tankPct >= 99.5) {
                this.tankBarEl.classList.add('pulse-tank');
            } else {
                this.tankBarEl.classList.remove('pulse-tank');
            }

            if (!this.isUserDraggingTankFill) {
                if (this.inpDebugTankFill) this.inpDebugTankFill.value = Math.round(tankPct).toString();
                if (this.valDebugTankFill) this.valDebugTankFill.textContent = `${Math.round(tankPct)}%`;
            }
        }

        if (cleanPct >= 98.0 && !this.victoryShown) {
            this.victoryShown = true;
            this.victoryBannerEl?.classList.remove('hidden');
        }
    }

    public showToast(msg: string): void {
        if (!this.toastEl) return;
        this.toastEl.textContent = msg;
        this.toastEl.classList.remove('hidden');
        if (this.toastTimer) window.clearTimeout(this.toastTimer);
        this.toastTimer = window.setTimeout(() => {
            this.toastEl?.classList.add('hidden');
        }, 2200);
    }
}
