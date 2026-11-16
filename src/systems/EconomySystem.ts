import { Rover } from '../entities/Rover';

export interface SaveData {
    coins: number;
    moonLevel: number;
    powerLevel: number;
    widthLevel: number;
    tankLevel: number;
    soundEnabled: boolean;
}

export class EconomySystem {
    public coins = 0;
    public moonLevel = 1;

    public powerLevel = 1;
    public widthLevel = 1;
    public tankLevel = 1;

    public soundEnabled = true;

    private rover: Rover;
    private readonly SAVE_KEY = 'lunar_sweeper_save_v1';

    // Callbacks
    public onCoinsChanged?: (newCoins: number) => void;
    public onUpgraded?: () => void;

    constructor(rover: Rover) {
        this.rover = rover;
        this.load();
        this.applyUpgradesToRover();
    }

    public getPowerCost(): number {
        return Math.floor(100 * Math.pow(1.45, this.powerLevel - 1));
    }

    public getWidthCost(): number {
        return Math.floor(150 * Math.pow(1.55, this.widthLevel - 1));
    }

    public getTankCost(): number {
        return Math.floor(120 * Math.pow(1.40, this.tankLevel - 1));
    }

    public buyPowerUpgrade(): boolean {
        const cost = this.getPowerCost();
        if (this.coins >= cost) {
            this.coins -= cost;
            this.powerLevel++;
            this.applyUpgradesToRover();
            this.save();
            if (this.onCoinsChanged) this.onCoinsChanged(this.coins);
            if (this.onUpgraded) this.onUpgraded();
            return true;
        }
        return false;
    }

    public buyWidthUpgrade(): boolean {
        const cost = this.getWidthCost();
        if (this.coins >= cost) {
            this.coins -= cost;
            this.widthLevel++;
            this.applyUpgradesToRover();
            this.save();
            if (this.onCoinsChanged) this.onCoinsChanged(this.coins);
            if (this.onUpgraded) this.onUpgraded();
            return true;
        }
        return false;
    }

    public buyTankUpgrade(): boolean {
        const cost = this.getTankCost();
        if (this.coins >= cost) {
            this.coins -= cost;
            this.tankLevel++;
            this.applyUpgradesToRover();
            this.save();
            if (this.onCoinsChanged) this.onCoinsChanged(this.coins);
            if (this.onUpgraded) this.onUpgraded();
            return true;
        }
        return false;
    }

    public grantFreeAdUpgrade(type: 'power' | 'width' | 'tank'): void {
        if (type === 'power') this.powerLevel++;
        if (type === 'width') this.widthLevel++;
        if (type === 'tank') this.tankLevel++;

        this.applyUpgradesToRover();
        this.save();
        if (this.onUpgraded) this.onUpgraded();
    }

    public applyUpgradesToRover(): void {
        this.rover.stats.sweeperPower = 1.0 + (this.powerLevel - 1) * 0.35;
        this.rover.stats.sweeperWidth = 0.24 + (this.widthLevel - 1) * 0.04;
        this.rover.stats.tankCapacity = 100 + (this.tankLevel - 1) * 75;
        this.rover.updateSweeperVisualWidth();
    }

    public unloadDust(amount: number): number {
        if (this.rover.stats.currentDust <= 0) return 0;

        const unloaded = Math.min(this.rover.stats.currentDust, amount);
        this.rover.stats.currentDust -= unloaded;

        // 1 Dust = 1.5 Moon Coins on average
        const coinGain = Math.ceil(unloaded * 1.5);
        this.coins += coinGain;

        if (this.onCoinsChanged) this.onCoinsChanged(this.coins);
        this.save();
        return unloaded;
    }

    public save(): void {
        const data: SaveData = {
            coins: this.coins,
            moonLevel: this.moonLevel,
            powerLevel: this.powerLevel,
            widthLevel: this.widthLevel,
            tankLevel: this.tankLevel,
            soundEnabled: this.soundEnabled
        };
        try {
            localStorage.setItem(this.SAVE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('LocalStorage save failed:', e);
        }
    }

    public load(): void {
        try {
            const raw = localStorage.getItem(this.SAVE_KEY);
            if (raw) {
                const data: SaveData = JSON.parse(raw);
                this.coins = data.coins || 0;
                this.moonLevel = data.moonLevel || 1;
                this.powerLevel = data.powerLevel || 1;
                this.widthLevel = data.widthLevel || 1;
                this.tankLevel = data.tankLevel || 1;
                if (data.soundEnabled !== undefined) this.soundEnabled = data.soundEnabled;
            }
        } catch (e) {
            console.warn('LocalStorage load failed:', e);
        }
    }
}
