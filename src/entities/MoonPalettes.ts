import * as THREE from 'three';

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

const RAW_MOON_PALETTES: MoonPalette[] = [
    {
        name: 'Bulan Klasik',
        baseColor: '#C9D1D9',
        craterColor: '#9AA3AF',
        rimColor: '#E5EBF2',
        dirt1Color: '#94A3B8',
        dirt2Color: '#766E8C',
        dirt3Color: '#4B4463',
        dirtHighlight: '#CBD5E1',
        bgPreset: 'earth'
    },
    {
        name: 'Crimson Mars',
        baseColor: '#E06D53',
        craterColor: '#C4543C',
        rimColor: '#F08D75',
        dirt1Color: '#A86250',
        dirt2Color: '#82404A',
        dirt3Color: '#522230',
        dirtHighlight: '#C7806E',
        bgPreset: 'supernova'
    },
    {
        name: 'Keju Emas',
        baseColor: '#F5D061',
        craterColor: '#E2BC4E',
        rimColor: '#F9DC7F',
        dirt1Color: '#B5965E',
        dirt2Color: '#8E6642',
        dirt3Color: '#5B3A26',
        dirtHighlight: '#D4B57B',
        bgPreset: 'sunset'
    },
    {
        name: 'Mint Kosmik',
        baseColor: '#7CE3C3',
        craterColor: '#65CDAC',
        rimColor: '#97EBCE',
        dirt1Color: '#649E92',
        dirt2Color: '#43737D',
        dirt3Color: '#274A59',
        dirtHighlight: '#88BFB3',
        bgPreset: 'emerald'
    },
    {
        name: 'Lavender',
        baseColor: '#B8B5E6',
        craterColor: '#A7A3DC',
        rimColor: '#C8C5ED',
        dirt1Color: '#8E86AD',
        dirt2Color: '#6E5A8A',
        dirt3Color: '#463363',
        dirtHighlight: '#B0A8CC',
        bgPreset: 'nebula'
    },
    {
        name: 'Glacial Arctica',
        baseColor: '#E2F1F8',
        craterColor: '#C5DFEC',
        rimColor: '#F0F8FD',
        dirt1Color: '#86ACC2',
        dirt2Color: '#5B84AD',
        dirt3Color: '#3B598A',
        dirtHighlight: '#A8CBE0',
        bgPreset: 'comet'
    },
    {
        name: 'Berry Pastel',
        baseColor: '#F59BB6',
        craterColor: '#DE7E9A',
        rimColor: '#FBB6C9',
        dirt1Color: '#B87E98',
        dirt2Color: '#9E4D82',
        dirt3Color: '#6E2B61',
        dirtHighlight: '#D49EB6',
        bgPreset: 'synthwave'
    },
    {
        name: 'Langit Biru',
        baseColor: '#8ECAE6',
        craterColor: '#6FB5D6',
        rimColor: '#A9DAF2',
        dirt1Color: '#78A2BD',
        dirt2Color: '#4F7BA8',
        dirt3Color: '#325180',
        dirtHighlight: '#9BC1D9',
        bgPreset: 'aurora'
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

/**
 * Procedurally derives distinct, harmonious Tier 1/2/3 dust colors
 * from a moon's baseColor with subtle hue shifts and clear contrast.
 */
export function deriveDustTierColors(baseColorHex: string): {
    dirt1Color: string;
    dirt2Color: string;
    dirt3Color: string;
    dirtHighlight: string;
} {
    const base = new THREE.Color(baseColorHex);
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);

    const c1 = new THREE.Color().setHSL(
        hsl.h,
        Math.max(0.08, hsl.s * 0.85),
        THREE.MathUtils.clamp(hsl.l * 0.72, 0.22, 0.70)
    );
    const c2 = new THREE.Color().setHSL(
        (hsl.h + 0.045) % 1.0,
        THREE.MathUtils.clamp(hsl.s * 1.15 + 0.08, 0.14, 0.68),
        THREE.MathUtils.clamp(hsl.l * 0.52, 0.16, 0.52)
    );
    const c3 = new THREE.Color().setHSL(
        (hsl.h + 0.095) % 1.0,
        THREE.MathUtils.clamp(hsl.s * 1.25 + 0.14, 0.18, 0.76),
        THREE.MathUtils.clamp(hsl.l * 0.34, 0.10, 0.36)
    );
    const hi = new THREE.Color().setHSL(
        hsl.h,
        Math.max(0.06, hsl.s * 0.75),
        THREE.MathUtils.clamp(hsl.l * 0.86, 0.32, 0.82)
    );

    return {
        dirt1Color: `#${c1.getHexString()}`,
        dirt2Color: `#${c2.getHexString()}`,
        dirt3Color: `#${c3.getHexString()}`,
        dirtHighlight: `#${hi.getHexString()}`
    };
}

function makeMoon(name: string, baseColor: string, bgPreset: string): MoonPalette {
    const base = new THREE.Color(baseColor);
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    const crater = new THREE.Color().setHSL(hsl.h, hsl.s, Math.max(0.08, hsl.l - 0.12));
    const rim = new THREE.Color().setHSL(hsl.h, hsl.s, Math.min(0.95, hsl.l + 0.10));
    return {
        name,
        baseColor,
        craterColor: `#${crater.getHexString()}`,
        rimColor: `#${rim.getHexString()}`,
        dirt1Color: '#000000',
        dirt2Color: '#000000',
        dirt3Color: '#000000',
        dirtHighlight: '#000000',
        bgPreset
    };
}

const EXTRA_MOONS: MoonPalette[] = [
    makeMoon('Safir Kosmos', '#5B8DEF', 'void'),
    makeMoon('Koral Fajar', '#F4846A', 'sunset'),
    makeMoon('Pistachio', '#A3D977', 'emerald'),
    makeMoon('Ubi Ungu', '#9D65C9', 'nebula'),
    makeMoon('Salju Kutub', '#DCEEF8', 'comet'),
    makeMoon('Madu Hutan', '#E8A838', 'golden_nebula'),
    makeMoon('Batu Giok', '#3CB371', 'aurora'),
    makeMoon('Mawar Debu', '#D97B93', 'synthwave'),
    makeMoon('Langit Senja', '#E07A5F', 'sunset'),
    makeMoon('Pasir Sahara', '#E6C280', 'golden_nebula'),
    makeMoon('Biru Samudra', '#3B82F6', 'earth'),
    makeMoon('Anggur Malam', '#7C3AED', 'nebula'),
    makeMoon('Matcha Latte', '#88B87E', 'emerald'),
    makeMoon('Tembaga Tua', '#B87333', 'asteroid'),
    makeMoon('Es Kristal', '#7DD3FC', 'crystal_void'),
    makeMoon('Delima Merah', '#DC2626', 'supernova'),
    makeMoon('Kuning Kenari', '#FDE047', 'milkyway'),
    makeMoon('Abu Vulkanik', '#6B7280', 'blackhole'),
    makeMoon('Toska Tropis', '#2DD4BF', 'aurora'),
    makeMoon('Orchid Mekar', '#D946EF', 'synthwave'),
    makeMoon('Karamel Manis', '#C68B59', 'golden_nebula'),
    makeMoon('Biru Kobalt', '#2563EB', 'cybergrid'),
    makeMoon('Hijau Lumut', '#65A30D', 'emerald'),
    makeMoon('Persik Lembut', '#FDBA74', 'sunset'),
    makeMoon('Plum Gelap', '#6B21A8', 'blackhole'),
    makeMoon('Perak Meteor', '#CBD5E1', 'void'),
    makeMoon('Saffron Emas', '#F59E0B', 'milkyway'),
    makeMoon('Aqua Marina', '#22D3EE', 'crystal_void'),
    makeMoon('Kopi Susu', '#A68A64', 'asteroid'),
    makeMoon('Magenta Neon', '#EC4899', 'synthwave'),
    makeMoon('Zaitun Klasik', '#84A98C', 'emerald'),
    makeMoon('Bata Terakota', '#C85A32', 'supernova'),
    makeMoon('Langit Pagi', '#93C5FD', 'earth'),
    makeMoon('Violet Mist', '#C4B5FD', 'nebula'),
    makeMoon('Ochre Gurun', '#CC8E35', 'golden_nebula'),
    makeMoon('Teal Dalam', '#0F766E', 'aurora'),
    makeMoon('Sakura Muda', '#FBCFE8', 'synthwave'),
    makeMoon('Granit Biru', '#64748B', 'void'),
    makeMoon('Jeruk Bali', '#FB7185', 'sunset'),
    makeMoon('Lime Segar', '#84CC16', 'emerald'),
    makeMoon('Indigo Malam', '#4338CA', 'cybergrid'),
    makeMoon('Gading Hangat', '#F3E5AB', 'milkyway'),
    makeMoon('Rubi Kosmik', '#BE123C', 'supernova'),
    makeMoon('Sian Elektrik', '#06B6D4', 'crystal_void'),
    makeMoon('Kayu Cendana', '#B08968', 'asteroid'),
    makeMoon('Lilac Lembut', '#D8B4FE', 'nebula'),
    makeMoon('Zamrud Gelap', '#047857', 'emerald'),
    makeMoon('Kuning Kunyit', '#EAB308', 'golden_nebula'),
    makeMoon('Biru Denims', '#4F6D7A', 'comet'),
    makeMoon('Merah Bata', '#B91C1C', 'supernova'),
    makeMoon('Mint Es', '#A7F3D0', 'aurora'),
    makeMoon('Koral Terang', '#FF7F50', 'sunset'),
    makeMoon('Arang Halus', '#475569', 'blackhole'),
    makeMoon('Bunga Telang', '#6366F1', 'cybergrid'),
    makeMoon('Melon Madu', '#BEF264', 'emerald'),
    makeMoon('Krim Vanila', '#FEF3C7', 'milkyway'),
    makeMoon('Ungu Terong', '#581C87', 'nebula'),
    makeMoon('Biru Langit', '#38BDF8', 'earth'),
    makeMoon('Perunggu', '#92400E', 'asteroid'),
    makeMoon('Fuchsia', '#E879F9', 'synthwave'),
    makeMoon('Hijau Daun', '#22C55E', 'emerald'),
    makeMoon('Kuning Lemon', '#FEF08A', 'golden_nebula'),
    makeMoon('Baja Biru', '#475569', 'comet'),
    makeMoon('Merah Koral', '#EF4444', 'supernova'),
    makeMoon('Turquoise', '#14B8A6', 'aurora'),
    makeMoon('Lavender Muda', '#E0E7FF', 'crystal_void'),
    makeMoon('Coklat Susu', '#8D6E63', 'asteroid'),
    makeMoon('Biru Royal', '#1D4ED8', 'cybergrid'),
    makeMoon('Hijau Sage', '#9CAF88', 'emerald'),
    makeMoon('Oranye Labu', '#F97316', 'sunset'),
    makeMoon('Pink Flamingo', '#F472B6', 'synthwave'),
    makeMoon('Abu Mutiara', '#D1D5DB', 'void'),
    makeMoon('Emas Mawar', '#E0BFB8', 'milkyway'),
    makeMoon('Biru Pirus', '#0891B2', 'crystal_void'),
    makeMoon('Merah Marun', '#881337', 'blackhole'),
    makeMoon('Hijau PinUS', '#15803D', 'aurora')
];

export const MOON_PALETTES: MoonPalette[] = [...RAW_MOON_PALETTES, ...EXTRA_MOONS].map((p) => ({
    ...p,
    ...deriveDustTierColors(p.baseColor)
}));
