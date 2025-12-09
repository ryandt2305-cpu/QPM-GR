// QPM SpritesCore (ported from Aries mod with QPM-specific wrappers)
// Deterministic sheet slicing, mutation filters/icons, and bounded caches.

import { log } from './logger';
import { shareGlobal } from '../core/pageContext';
import { tileRefsPlants, tileRefsTallPlants, tileRefsSeeds, tileRefsItems, tileRefsPets } from '../data/tileRefs';

// Unsafe window for userscript contexts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const unsafeWindow: (Window & typeof globalThis) | undefined;

// ----- Types -----

type SpriteMode = 'bitmap' | 'canvas' | 'dataURL';
type SpriteCategory = 'tiles' | 'ui' | 'unknown';

type SpriteFilterConfig = {
	blendMode: GlobalCompositeOperation;
	colors: string[];
	alpha?: number;
	gradientAngle?: number;
	masked?: boolean;
	reverse?: boolean;
};

type MutationName =
	| 'Gold'
	| 'Rainbow'
	| 'Wet'
	| 'Chilled'
	| 'Frozen'
	| 'Dawnlit'
	| 'Ambershine'
	| 'Dawncharged'
	| 'Ambercharged'
	| 'Dawnbound'
	| 'Amberlit'
	| 'Amberbound';

export type TileInfo<T = ImageBitmap | HTMLCanvasElement | string> = {
	sheet: string;
	url: string;
	index: number;
	col: number;
	row: number;
	size: number;
	data: T;
};

type MutationIconTile = {
	tile: TileInfo<HTMLCanvasElement>;
	offsetX?: number;
	offsetY?: number;
	scale?: number;
	opacity?: number;
	ignoreBaseOffset?: boolean;
};

type Config = {
	skipAlphaBelow: number;
	blackBelow: number;
	tolerance: number;
	ruleAllplants512: RegExp;
};

type LoadTilesOptions = {
	mode?: SpriteMode;
	includeBlanks?: boolean;
	forceSize?: 256 | 512;
	onlySheets?: RegExp;
};

type PreloadTilesOptions = LoadTilesOptions & {
	batchSize?: number;
	delayMs?: number;
	onProgress?: (processed: number, total: number) => void;
};

// ----- Constants -----

const DEFAULT_SHEETS: Array<{ alias: string; url: string; forceSize?: 256 | 512 }> = [
	{ alias: 'plants', url: 'https://magicgarden.gg/version/436ff68/assets/tiles/plants.png' },
	// Note: allplants.png doesn't exist (404), removed to prevent errors
	{ alias: 'tallplants', url: 'https://magicgarden.gg/version/436ff68/assets/tiles/tallplants.png' },
	{ alias: 'pets', url: 'https://magicgarden.gg/version/436ff68/assets/tiles/pets.png' },
	{ alias: 'mutation-overlays', url: 'https://magicgarden.gg/version/436ff68/assets/tiles/mutation-overlays.png', forceSize: 256 },
	{ alias: 'items', url: 'https://magicgarden.gg/version/436ff68/assets/tiles/items.png' },
	{ alias: 'mutations', url: 'https://magicgarden.gg/version/436ff68/assets/tiles/mutations.png' },
	{ alias: 'seeds', url: 'https://magicgarden.gg/version/436ff68/assets/tiles/seeds.png' },
	{ alias: 'animations', url: 'https://magicgarden.gg/version/436ff68/assets/tiles/animations.png' },
];

const mutationFilters: Record<MutationName, SpriteFilterConfig> = {
	Gold: { blendMode: 'source-atop', colors: ['rgb(255, 215, 0)'], alpha: 0.7 },
	Rainbow: { blendMode: 'color', colors: ['#FF1744', '#FF9100', '#FFEA00', '#00E676', '#2979FF', '#D500F9'], gradientAngle: 130, masked: true },
	Wet: { blendMode: 'source-atop', colors: ['rgb(128, 128, 255)'], alpha: 0.2 },
	Chilled: { blendMode: 'source-atop', colors: ['rgb(183, 183, 236)'], alpha: 0.5 },
	Frozen: { blendMode: 'source-atop', colors: ['rgb(128, 128, 255)'], alpha: 0.6 },
	Dawnlit: { blendMode: 'source-atop', colors: ['rgb(120, 100, 180)'], alpha: 0.4 },
	Ambershine: { blendMode: 'source-atop', colors: ['rgb(255, 140, 26)', 'rgb(230, 92, 26)', 'rgb(178, 58, 26)'], alpha: 0.5 },
	Dawncharged: { blendMode: 'source-atop', colors: ['rgb(100, 80, 160)', 'rgb(110, 90, 170)', 'rgb(120, 100, 180)'], alpha: 0.5 },
	Ambercharged: { blendMode: 'source-atop', colors: ['rgb(167, 50, 30)', 'rgb(177, 60, 40)', 'rgb(187, 70, 50)'], alpha: 0.5 },
	Dawnbound: { blendMode: 'source-atop', colors: ['rgb(120, 100, 180)'], alpha: 0.4 },
	Amberlit: { blendMode: 'source-atop', colors: ['rgb(255, 160, 60)'], alpha: 0.45 },
	Amberbound: { blendMode: 'source-atop', colors: ['rgb(200, 120, 50)'], alpha: 0.5 },
};

const MUTATION_PRIORITY: MutationName[] = [
	'Gold',
	'Rainbow',
	'Wet',
	'Chilled',
	'Frozen',
	'Dawnlit',
	'Ambershine',
	'Dawncharged',
	'Ambercharged',
	'Dawnbound',
	'Amberlit',
	'Amberbound',
];

const HIGH_MUTATIONS = new Set<MutationName>([
	'Dawnlit',
	'Ambershine',
	'Dawncharged',
	'Ambercharged',
]);

// TileRef maps (1-based in sheets)
const plantTileRefs = buildLowerMap(tileRefsPlants);
const tallPlantTileRefs = buildLowerMap(tileRefsTallPlants);
const seedTileRefs = buildLowerMap(tileRefsSeeds);
const itemTileRefs = buildLowerMap(tileRefsItems);
const petTileRefs = buildLowerMap(tileRefsPets);
const plantTileRefValues = new Set<number>(Object.values(tileRefsPlants));
const tallPlantTileRefValues = new Set<number>(Object.values(tileRefsTallPlants));

const MUTATION_OVERLAY_TILE_MAP: Record<string, number> = {
	wettallplant: 0,
	chilledtallplant: 1,
	frozentallplant: 2,
	wet: 3,
	chilled: 4,
	frozen: 5,
	dawnlit: 6,
	ambershine: 7,
	dawncharged: 8,
	ambercharged: 9,
};

// Match Aries mod tileRefsMutations (1-based in the sheet), with logical aliases
const MUTATION_TILE_MAP: Record<string, number> = {
	wet: 1,
	chilled: 2,
	frozen: 3,
	dawnlit: 11,
	amberlit: 12, // in-game key, maps to logical Ambershine
	ambershine: 12,
	dawncharged: 13,
	dawnbound: 13,
	ambercharged: 14,
	amberbound: 14,
};

const CACHE_LIMIT = 256;

// ----- Utilities -----

function getRuntimeWindow(): Window & typeof globalThis {
	if (typeof unsafeWindow !== 'undefined' && unsafeWindow) return unsafeWindow;
	return window;
}

function fileBase(url: string): string {
	const name = decodeURIComponent(url.split('/').pop() || '');
	return name.replace(/\.[a-z0-9]+$/i, '');
}

function normalizeUrl(url: string): string {
	if (!url) return '';
	const trimmed = url.split('#')[0] || url;
	if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
	try {
		const normalized = new URL(trimmed, typeof window !== 'undefined' ? window.location.href : undefined);
		normalized.hash = '';
		return normalized.href;
	} catch {
		return trimmed;
	}
}

function isImageUrl(u: string): boolean {
	try {
		if (!u || u.startsWith('blob:')) return false;
		return /(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(u);
	} catch {
		return false;
	}
}

function guessFamiliesFromUrl(u: string): string[] {
	const families: string[] = [];
	const normalized = u.replace(/^\/+/, '').toLowerCase();
	if (/(^|\/)ui\//.test(normalized)) families.push('ui');
	if (/(^|\/)tiles\//.test(normalized) || /(map|plants|allplants|items|seeds|pets|animations|mutations)\.(png|webp)$/i.test(normalized)) {
		families.push('tiles');
	}
	return families;
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((res, rej) => {
		const im = new Image();
		im.crossOrigin = 'anonymous';
		im.onload = () => res(im);
		im.onerror = rej;
		im.src = url;
	});
}

function guessSize(url: string, img: HTMLImageElement, forced?: number, cfg?: Config): number {
	if (forced) return forced;
	if (cfg?.ruleAllplants512?.test(url)) return 512;
	if (img.width % 256 === 0 && img.height % 256 === 0) return 256;
	if (img.width % 512 === 0 && img.height % 512 === 0) return 512;
	return 256;
}

function isBlankOrBlack(data: ImageData, cfg: Config): boolean {
	const aThr = cfg.skipAlphaBelow;
	const bThr = cfg.blackBelow;
	const tol = cfg.tolerance;
		const d = data.data;
	const maxColored = Math.ceil((d.length / 4) * tol);
	let colored = 0;
	for (let i = 0; i < d.length; i += 4) {
			const a = d[i + 3] ?? 0;
			if (a > aThr) {
				const r = d[i] ?? 0;
				const g = d[i + 1] ?? 0;
				const b = d[i + 2] ?? 0;
			if (r > bThr || g > bThr || b > bThr) {
				if (++colored > maxColored) return false;
			}
		}
	}
	return true;
}

function setBoundedCache(cache: Map<string, string>, key: string, value: string): void {
	if (!cache.has(key) && cache.size >= CACHE_LIMIT) {
		const firstKey = cache.keys().next().value as string | undefined;
		if (firstKey) cache.delete(firstKey);
	}
	cache.set(key, value);
}

// ----- SpritesCore -----

export class SpritesCore {
	public cfg: Config = {
		skipAlphaBelow: 1,
		blackBelow: 8,
		tolerance: 0.005,
		ruleAllplants512: /allplants|mutation-overlays/i,
	};

	private initialized = false;
	private onMessageListener: ((e: MessageEvent) => void) | undefined;

	private all = new Set<string>();
	private familyAssets = new Map<string, Set<string>>();
	private assetFamilies = new Map<string, string[]>();

	private tileCacheBitmap = new Map<string, TileInfo<ImageBitmap>[] | undefined>();
	private tileCacheCanvas = new Map<string, TileInfo<HTMLCanvasElement>[] | undefined>();
	private tileCacheDataURL = new Map<string, TileInfo<string>[] | undefined>();
	private uiCache = new Map<string, HTMLImageElement>();

	constructor(autoStart = true) {
		if (autoStart) this.init();
	}

	public init(): this {
		if (this.initialized) return this;
		this.initialized = true;
		this.startSniffers();
		DEFAULT_SHEETS.forEach(({ alias, url, forceSize }) => {
			void this.loadSheetFromUrl(url, alias, forceSize);
		});
		shareGlobal('Sprites', this);
		return this;
	}

	public destroy(): void {
		if (!this.initialized) return;
		this.initialized = false;
		this.uiCache.clear();
		this.tileCacheBitmap.clear();
		this.tileCacheCanvas.clear();
		this.tileCacheDataURL.clear();
		if (this.onMessageListener) {
			getRuntimeWindow().removeEventListener('message', this.onMessageListener, true);
			this.onMessageListener = undefined;
		}
	}

	// ----- Asset lists -----

	public lists(): { all: string[]; [family: string]: string[] } {
		const result: { all: string[]; [family: string]: string[] } = { all: [...this.all] };
		for (const [family, assets] of this.familyAssets) {
			result[family] = [...assets];
		}
		return result;
	}

	public listFamilies(): string[] {
		return [...this.familyAssets.keys()];
	}

	public listAssetsForFamily(family: string): string[] {
		const normalized = family?.trim().toLowerCase();
		if (!normalized) return [];
		return [...(this.familyAssets.get(normalized) ?? new Set<string>())];
	}

	public registerKnownAsset(url: string, families: string[] = ['tiles']): boolean {
		return this.addAsset(url, families);
	}

	public listTilesByCategory(re: RegExp): string[] {
		return [...this.familyAssets.get('tiles') ?? new Set()].filter((u) => re.test(u));
	}
	public listPlants(): string[] { return this.listTilesByCategory(/plants/i); }
	public listAllPlants(): string[] { return this.listTilesByCategory(this.cfg.ruleAllplants512); }
	public listItems(): string[] { return this.listTilesByCategory(/items/i); }
	public listSeeds(): string[] { return this.listTilesByCategory(/seeds/i); }
	public listPets(): string[] { return this.listTilesByCategory(/pets/i); }

	// ----- Loading -----

	public async loadUI(): Promise<Map<string, HTMLImageElement>> {
		const out = new Map<string, HTMLImageElement>();
		for (const u of this.familyAssets.get('ui') ?? new Set()) {
			if (!this.uiCache.has(u)) {
				const im = await loadImage(u);
				this.uiCache.set(u, im);
			}
			out.set(fileBase(u), this.uiCache.get(u)!);
		}
		return out;
	}

	public async loadTiles(options: LoadTilesOptions = {}): Promise<Map<string, TileInfo<any>[]>> {
		const { mode = 'bitmap', includeBlanks = false, forceSize, onlySheets } = options;
		const out = new Map<string, TileInfo<any>[]>();
		const tiles = [...(this.familyAssets.get('tiles') ?? new Set())];
		const list = onlySheets ? tiles.filter((u) => onlySheets.test(u)) : tiles;
		for (const u of list) {
			const arr = await this.ensureTilesForUrl(u, forceSize ? { mode, includeBlanks, forceSize } : { mode, includeBlanks });
			out.set(fileBase(u), arr);
		}
		return out;
	}

	public async loadSheetFromUrl(url: string, _alias?: string, forceSize?: 256 | 512): Promise<boolean> {
		const abs = normalizeUrl(url);
		this.registerKnownAsset(abs, ['tiles']);
		try {
			const opts: { mode: SpriteMode; includeBlanks: boolean; forceSize?: 256 | 512 } = forceSize
				? { mode: 'canvas', includeBlanks: false, forceSize }
				: { mode: 'canvas', includeBlanks: false };
			await this.ensureTilesForUrl(abs, opts);
			return true;
		} catch (error) {
			log(`⚠️ Failed to load sprite sheet from ${url}`, error);
			return false;
		}
	}

	public async preloadTilesGradually(options: PreloadTilesOptions = {}): Promise<void> {
		const { mode = 'bitmap', includeBlanks = false, forceSize, onlySheets, batchSize = 1, delayMs = 40, onProgress } = options;
		const tiles = [...(this.familyAssets.get('tiles') ?? new Set())];
		const list = onlySheets ? tiles.filter((u) => onlySheets.test(u)) : tiles;
		const total = list.length;
		if (!total) return;
		let processed = 0;
		for (const url of list) {
			const opts = forceSize ? { mode, includeBlanks, forceSize } : { mode, includeBlanks };
			await this.ensureTilesForUrl(url, opts);
			processed += 1;
			onProgress?.(processed, total);
			if (delayMs > 0 && processed < total && processed % Math.max(1, batchSize) === 0) {
				await this.delay(delayMs);
			}
		}
	}

	public async loadTilesAuto(): Promise<Map<string, TileInfo[]>> {
		return this.loadTiles({ mode: 'bitmap' });
	}
	public async loadTiles256(): Promise<Map<string, TileInfo[]>> {
		return this.loadTiles({ mode: 'bitmap', forceSize: 256 });
	}
	public async loadTiles512(): Promise<Map<string, TileInfo[]>> {
		return this.loadTiles({ mode: 'bitmap', forceSize: 512 });
	}

	public async getTile(sheetBase: string, index: number, mode: SpriteMode = 'bitmap'): Promise<TileInfo | null> {
		const url = [...(this.familyAssets.get('tiles') ?? new Set())].find((u) => fileBase(u) === sheetBase);
		if (!url) return null;
		const map = await this.loadTiles({ mode, onlySheets: new RegExp(sheetBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.(png|webp)$', 'i') });
		const tiles = map.get(sheetBase) || [];
		const tile = tiles.find((t) => t.index === index);
		return tile ?? null;
	}

	public async flatTiles(options: LoadTilesOptions = {}): Promise<TileInfo[]> {
		const maps = await this.loadTiles(options);
		const all: TileInfo[] = [];
		maps.forEach((arr) => all.push(...arr));
		return all;
	}

	public clearCaches(): void {
		this.tileCacheBitmap.forEach((arr) => arr?.forEach((t) => (t.data as ImageBitmap).close?.()));
		this.tileCacheBitmap.clear();
		this.tileCacheCanvas.clear();
		this.tileCacheDataURL.clear();
		this.uiCache.clear();
	}

	public toCanvas(tile: TileInfo<ImageBitmap | HTMLCanvasElement | string>): HTMLCanvasElement {
		return this.tileToCanvas(tile);
	}

	public applyCanvasFilter(canvas: HTMLCanvasElement, filterName: MutationName): HTMLCanvasElement | null {
		const cfg = mutationFilters[filterName];
		if (!cfg) return null;
		const w = canvas.width;
		const h = canvas.height;
		const out = document.createElement('canvas');
		out.width = w;
		out.height = h;
		const ctx = out.getContext('2d');
		if (!ctx) return null;
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(canvas, 0, 0);
		ctx.save();
		ctx.globalCompositeOperation = cfg.blendMode;
		if (cfg.alpha != null) ctx.globalAlpha = cfg.alpha;
		if (cfg.masked) {
			const mask = document.createElement('canvas');
			mask.width = w;
			mask.height = h;
			const mctx = mask.getContext('2d');
			if (mctx) {
				this.drawGradient(mctx, w, h, cfg);
				mctx.globalCompositeOperation = 'destination-in';
				mctx.drawImage(canvas, 0, 0);
				mctx.globalCompositeOperation = 'source-over';
				ctx.drawImage(mask, 0, 0);
			}
		} else {
			this.drawGradient(ctx, w, h, cfg);
		}
		ctx.restore();
		return out;
	}

	public applySpriteFilter(tile: TileInfo<ImageBitmap | HTMLCanvasElement | string>, filterName: string): HTMLCanvasElement | null {
		const canvas = this.tileToCanvas(tile);
		return this.applyCanvasFilter(canvas, filterName as MutationName);
	}

	public renderPlantWithMutationsNonTall(opts: {
		baseTile: TileInfo<ImageBitmap | HTMLCanvasElement | string>;
		mutations: string[];
		mutationIcons: Record<string, MutationIconTile>;
		mutationOverlayTiles?: Record<string, MutationIconTile>;
		isTall?: boolean;
	}): HTMLCanvasElement {
		const { baseTile, mutations, mutationIcons, mutationOverlayTiles, isTall } = opts;
		let canvas = this.tileToCanvas(baseTile);
		const size = canvas.width;
		let ctx = canvas.getContext('2d')!;
		ctx.imageSmoothingEnabled = false;

		const ordered = this.sortMutations(mutations);
		const colorMutations = ordered.filter(
			(m) =>
				m === 'Gold' ||
				m === 'Rainbow' ||
				m === 'Wet' ||
				m === 'Chilled' ||
				m === 'Frozen' ||
				m === 'Dawnlit' ||
				m === 'Ambershine' ||
				m === 'Dawncharged' ||
				m === 'Ambercharged',
		) as MutationName[];
		const iconMutations = ordered.filter((m) => mutationIcons[m]) as MutationName[];
		const tall = isTall ?? canvas.height > size;

		if (colorMutations.length) {
			canvas = this.applyColorMutations(canvas, colorMutations);
			ctx = canvas.getContext('2d')!;
		}

		if (iconMutations.length) this.drawMutationIcons(ctx, iconMutations, size, mutationIcons);

		return canvas;
	}

	// ----- Internals -----

	private startSniffers(): void {
		const runtimeWindow = getRuntimeWindow();
		this.onMessageListener = (e: MessageEvent) => {
			const d: any = e.data;
			if (d && d.__awc && d.url) this.add(d.url, 'worker');
		};
		runtimeWindow.addEventListener('message', this.onMessageListener, true);
	}

	private normalizeFamilies(families?: string[] | null): string[] {
		const set = new Set<string>();
		for (const raw of families ?? []) {
			const normalized = raw?.trim().toLowerCase();
			if (normalized) set.add(normalized);
		}
		return [...set];
	}

	private add(url: string, _why = ''): void {
		const families = guessFamiliesFromUrl(url);
		if (!families.length) return;
		this.addAsset(url, families);
	}

	private addAsset(url: string, families: string[] = ['tiles']): boolean {
		const abs = normalizeUrl(url);
		if (!isImageUrl(abs) || this.all.has(abs)) return false;

		const normalized = this.normalizeFamilies(families);
		if (!normalized.length) return false;

		this.all.add(abs);
		this.assetFamilies.set(abs, normalized);
		for (const family of normalized) {
			let bucket = this.familyAssets.get(family);
			if (!bucket) {
				bucket = new Set();
				this.familyAssets.set(family, bucket);
			}
			bucket.add(abs);
		}
		return true;
	}

	private getCacheForMode(mode: SpriteMode): Map<string, TileInfo<any>[] | undefined> {
		if (mode === 'canvas') return this.tileCacheCanvas;
		if (mode === 'dataURL') return this.tileCacheDataURL;
		return this.tileCacheBitmap;
	}

	private async ensureTilesForUrl(url: string, opts: { mode: SpriteMode; includeBlanks: boolean; forceSize?: 256 | 512 }): Promise<TileInfo<any>[]> {
		const cache = this.getCacheForMode(opts.mode);
		const cached = cache.get(url);
		if (cached) return cached as TileInfo<any>[];
		const tiles = await this.sliceOne(url, opts);
		cache.set(url, tiles as any);
		return tiles as any;
	}

	private async sliceOne(url: string, opts: { mode: SpriteMode; includeBlanks: boolean; forceSize?: 256 | 512 }): Promise<TileInfo[]> {
		const img = await loadImage(url);
		const size = guessSize(url, img, opts.forceSize, this.cfg);
		const cols = Math.floor(img.width / size);
		const rows = Math.floor(img.height / size);
		const base = fileBase(url);

		const can = document.createElement('canvas');
		can.width = size;
		can.height = size;
		const ctx = can.getContext('2d', { willReadFrequently: true })!;
		ctx.imageSmoothingEnabled = false;

		const list: TileInfo[] = [];
		let idx = 0;
		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < cols; col++) {
				ctx.clearRect(0, 0, size, size);
				ctx.drawImage(img, col * size, row * size, size, size, 0, 0, size, size);
				let blank = false;
				try {
					const data = ctx.getImageData(0, 0, size, size);
					blank = isBlankOrBlack(data, this.cfg);
				} catch {
					blank = false;
				}
				if (!opts.includeBlanks && blank) { idx++; continue; }

				if (opts.mode === 'bitmap') {
					const bmp = await createImageBitmap(can);
					list.push({ sheet: base, url, index: idx, col, row, size, data: bmp });
				} else if (opts.mode === 'canvas') {
					const clone = document.createElement('canvas');
					clone.width = size;
					clone.height = size;
					clone.getContext('2d')!.drawImage(can, 0, 0);
					list.push({ sheet: base, url, index: idx, col, row, size, data: clone });
				} else {
					const dataURL: string = await new Promise<string>((resolve, reject) => {
						can.toBlob((blob) => {
							if (!blob) { reject(new Error('toBlob returned null')); return; }
							const fr = new FileReader();
							fr.onerror = reject;
							fr.onload = () => resolve(fr.result as string);
							fr.readAsDataURL(blob);
						}, 'image/png');
					});
					list.push({ sheet: base, url, index: idx, col, row, size, data: dataURL });
				}
				idx++;
			}
		}
		return list;
	}

	private delay(ms: number): Promise<void> {
		if (ms <= 0) return Promise.resolve();
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	private tileToCanvas(tile: TileInfo<ImageBitmap | HTMLCanvasElement | string>): HTMLCanvasElement {
		const src: any = tile.data;
		let w = tile.size;
		let h = tile.size;
		const out = document.createElement('canvas');
		out.width = w;
		out.height = h;
		const ctx = out.getContext('2d')!;
		ctx.imageSmoothingEnabled = false;

		if (src instanceof HTMLCanvasElement) {
			w = src.width; h = src.height; out.width = w; out.height = h; ctx.drawImage(src, 0, 0);
		} else if (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap) {
			w = src.width; h = src.height; out.width = w; out.height = h; ctx.drawImage(src, 0, 0);
		} else if (typeof src === 'string') {
			throw new Error('Sprites: tile.data is a dataURL; reload tile in bitmap/canvas mode.');
		} else {
			ctx.drawImage(src as CanvasImageSource, 0, 0);
		}
		return out;
	}

	private drawGradient(ctx: CanvasRenderingContext2D, w: number, h: number, cfg: SpriteFilterConfig): void {
		const baseColors = cfg.colors.length ? cfg.colors : ['#ffffff'];
		const colors = cfg.reverse ? [...baseColors].reverse() : baseColors;
		if (cfg.gradientAngle != null) {
			const grad = this.makeAngleGradient(ctx, w, h, cfg.gradientAngle);
			if (colors.length === 1) {
				const singleColor = colors[0] ?? '#ffffff';
				grad.addColorStop(0, singleColor);
				grad.addColorStop(1, singleColor);
			} else {
				colors.forEach((color, idx) => grad.addColorStop(idx / (colors.length - 1), color ?? '#ffffff'));
			}
			ctx.fillStyle = grad;
			ctx.fillRect(0, 0, w, h);
			return;
		}
		const grad = ctx.createLinearGradient(0, 0, 0, h);
		if (colors.length === 1) {
			const singleColor = colors[0] ?? '#ffffff';
			grad.addColorStop(0, singleColor);
			grad.addColorStop(1, singleColor);
		} else {
			colors.forEach((color, idx) => grad.addColorStop(idx / (colors.length - 1), color ?? '#ffffff'));
		}
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, w, h);
	}

	private makeAngleGradient(ctx: CanvasRenderingContext2D, w: number, h: number, angleDeg: number): CanvasGradient {
		const rad = (angleDeg - 90) * Math.PI / 180;
		const cx = w / 2;
		const cy = h / 2;
		const R = Math.min(w, h) / 2;
		const x0 = cx - Math.cos(rad) * R;
		const y0 = cy - Math.sin(rad) * R;
		const x1 = cx + Math.cos(rad) * R;
		const y1 = cy + Math.sin(rad) * R;
		return ctx.createLinearGradient(x0, y0, x1, y1);
	}

	private sortMutations(mutations: string[]): MutationName[] {
		const seen = new Set<MutationName>();
		const normalize = (value: string): MutationName => {
			const key = (value || '').trim();
			const norm = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
			switch (norm) {
				case 'Amberlit':
					return 'Ambershine';
				case 'Dawnbound':
					return 'Dawncharged';
				case 'Amberbound':
					return 'Ambercharged';
				default:
					return norm as MutationName;
			}
		};

		for (const raw of mutations) {
			const norm = normalize(raw);
			if (MUTATION_PRIORITY.includes(norm) && !seen.has(norm)) {
				seen.add(norm);
			}
		}
		return [...seen].sort((a, b) => MUTATION_PRIORITY.indexOf(a) - MUTATION_PRIORITY.indexOf(b));
	}

	private applyColorMutations(input: HTMLCanvasElement, mutations: MutationName[]): HTMLCanvasElement {
		if (!mutations.length) return input;
		if (mutations.includes('Gold')) return this.applyFilterChain(input, ['Gold']);
		if (mutations.includes('Rainbow')) return this.applyFilterChain(input, ['Rainbow']);
		const others = mutations.filter((m) => m !== 'Gold' && m !== 'Rainbow');
		return this.applyFilterChain(input, others);
	}

	private applyFilterChain(input: HTMLCanvasElement, filters: MutationName[]): HTMLCanvasElement {
		let current = input;
		for (const f of filters) {
			const next = this.applyCanvasFilter(current, f);
			if (next) current = next;
		}
		return current;
	}

	private drawMutationIcons(ctx: CanvasRenderingContext2D, mutations: MutationName[], tileSize: number, mutationIcons: Record<string, MutationIconTile>): void {
		ctx.save();
		ctx.imageSmoothingEnabled = false;
		for (const m of mutations) {
			const conf = mutationIcons[m];
			if (!conf) continue;
			const iconCanvas = conf.tile.data as HTMLCanvasElement;
			const srcW = iconCanvas.width;
			const srcH = iconCanvas.height;
			const scale = conf.scale ?? 1;
			const dstW = tileSize * scale;
			const dstH = tileSize * scale;
			const baseOffsetY = conf.ignoreBaseOffset ? 0 : HIGH_MUTATIONS.has(m) ? -tileSize * 0.25 : 0;
			const offsetX = (conf.offsetX ?? 0) * tileSize;
			const offsetY = (conf.offsetY ?? 0) * tileSize + baseOffsetY;
			if (conf.opacity != null) ctx.globalAlpha = conf.opacity;
			ctx.drawImage(iconCanvas, 0, 0, srcW, srcH, offsetX, offsetY, dstW, dstH);
			ctx.globalAlpha = 1;
		}
		ctx.restore();
	}

	private drawMutationOverlayTiles(
		ctx: CanvasRenderingContext2D,
		mutations: MutationName[],
		tileSize: number,
		overlays: Record<string, MutationIconTile>,
		isTall: boolean,
	): void {
		ctx.save();
		ctx.imageSmoothingEnabled = false;
		ctx.globalCompositeOperation = 'source-atop';
		for (const m of mutations) {
			const key = isTall && overlays[`${m}TallPlant`] ? `${m}TallPlant` : m;
			const conf = overlays[key];
			if (!conf) continue;
			const iconCanvas = conf.tile.data as HTMLCanvasElement;
			const srcW = iconCanvas.width;
			const srcH = iconCanvas.height;
			const scale = conf.scale ?? 1;
			const dstW = tileSize * scale;
			const dstH = tileSize * scale;
			const offsetX = (conf.offsetX ?? 0) * tileSize;
			const offsetY = (conf.offsetY ?? 0) * tileSize;
			ctx.globalAlpha = conf.opacity ?? 0.8;
			ctx.drawImage(iconCanvas, 0, 0, srcW, srcH, offsetX, offsetY, dstW, dstH);
		}
		ctx.restore();
	}
}

// ----- Shared instance -----

export const Sprites = new SpritesCore(false);
shareGlobal('Sprites', Sprites);

export function initSprites(config?: Partial<Config>): SpritesCore {
	if (config) Object.assign(Sprites.cfg, config);
	return Sprites.init();
}

// ----- QPM convenience wrappers -----

const CROP_SPRITE_URL_CACHE = new Map<string, string>();
const PET_SPRITE_URL_CACHE = new Map<string, string>();
const MUTATION_OVERLAY_CACHE = new Map<string, string>();

function toLowerKey(s: string): string {
	return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildLowerMap(record: Record<string, number>): Record<string, number> {
	const out: Record<string, number> = {};
	Object.entries(record).forEach(([key, value]) => {
		out[toLowerKey(key)] = value;
	});
	return out;
}

export async function getTileCanvas(sheet: string, index: number): Promise<HTMLCanvasElement | null> {
	const tile = await Sprites.getTile(sheet, index, 'canvas');
	if (!tile) return null;
	return (tile.data as HTMLCanvasElement) || null;
}

export function getCropSpriteByTileId(tileId: string | number | null | undefined): Promise<HTMLCanvasElement | null> {
	if (tileId == null) return Promise.resolve(null);
	const tileRef = typeof tileId === 'number' ? tileId : parseInt(String(tileId).replace(/[^0-9-]/g, ''), 10);
	if (!Number.isFinite(tileRef) || tileRef <= 0) return Promise.resolve(null);
	const idx = tileRef - 1;
	const isTall = tallPlantTileRefValues.has(tileRef);
	return (async () => {
		if (isTall) {
			const tall = await getTileCanvas('tallplants', idx);
			if (tall) return tall;
		}
		const fromPlants = await getTileCanvas('plants', idx);
		if (fromPlants) return fromPlants;
		const fromAll = await getTileCanvas('allplants', idx);
		if (fromAll) return fromAll;
		if (isTall) await Sprites.getTile('tallplants', idx, 'canvas');
		await Sprites.getTile('plants', idx, 'canvas');
		await Sprites.getTile('allplants', idx, 'canvas');
		return null;
	})();
}

export function getCropSpriteDataUrl(speciesOrTile: string | number | null | undefined): string | null {
	if (!speciesOrTile && speciesOrTile !== 0) return null;
	const key = typeof speciesOrTile === 'string' ? toLowerKey(speciesOrTile) : `tile-${speciesOrTile}`;
	if (!key) return null;
	if (CROP_SPRITE_URL_CACHE.has(key)) return CROP_SPRITE_URL_CACHE.get(key)!;
	let canvas: HTMLCanvasElement | null = null;
	if (typeof speciesOrTile === 'number') {
		canvas = legacyGetCropSpriteByTileId(speciesOrTile);
	} else if (speciesOrTile != null) {
		canvas = legacyGetCropSprite(String(speciesOrTile));
	}
	if (!canvas) return null;
	const url = canvas.toDataURL('image/png');
	setBoundedCache(CROP_SPRITE_URL_CACHE, key, url);
	return url;
}

export function getPetSpriteDataUrl(species: string): string | null {
	if (!species) return null;
	const norm = toLowerKey(species);
	if (!norm) return null;
	const cached = PET_SPRITE_URL_CACHE.get(norm);
	if (cached) return cached;
	const canvas = legacyGetPetSprite(norm);
	if (!canvas) return null;
	const url = canvas.toDataURL('image/png');
	setBoundedCache(PET_SPRITE_URL_CACHE, norm, url);
	return url;
}

export function getMutationOverlayDataUrl(mutation: string): string | null {
	const norm = toLowerKey(mutation);
	const cached = MUTATION_OVERLAY_CACHE.get(norm);
	if (cached) return cached;
	const idx = MUTATION_OVERLAY_TILE_MAP[norm];
	if (typeof idx !== 'number') return null;
	const canvas = legacyGetTile('mutation-overlays', idx);
	if (!canvas) return null;
	const url = canvas.toDataURL('image/png');
	setBoundedCache(MUTATION_OVERLAY_CACHE, norm, url);
	return url;
}

export function renderPlantWithMutations(base: HTMLCanvasElement, mutations: string[]): HTMLCanvasElement {
	return legacyRenderPlantWithMutations(base, mutations);
}

export function getPetSpriteCanvas(species: string): HTMLCanvasElement | null {
	return legacyGetPetSprite(species);
}

export function createSpriteElement(sheet: string, index: number, size = 64): HTMLDivElement | null {
	const tile = legacyGetTile(sheet, index);
	if (!tile) return null;
	let url: string | null = null;
	try {
		url = tile.toDataURL('image/png');
	} catch (error) {
		log('⚠️ Unable to read sprite data URL', error);
		return null;
	}
	const el = document.createElement('div');
	el.style.cssText = `width:${size}px;height:${size}px;background:url(${url}) center/contain no-repeat;image-rendering:pixelated;flex-shrink:0;`;
	el.dataset.sheet = sheet;
	el.dataset.index = String(index);
	return el;
}

export async function renderPlantSprite(tileId: string | number | null | undefined, species?: string | null, mutations: string[] = []): Promise<string | null> {
	const baseCanvas = legacyGetCropSpriteByTileId(tileId) || (species ? legacyGetCropSprite(species) : null);
	if (!baseCanvas) return null;
	const withMut = mutations.length ? legacyRenderPlantWithMutations(baseCanvas, mutations) : baseCanvas;
	return withMut.toDataURL('image/png');
}

export async function loadTrackedSpriteSheets(maxSheets = 3, _category: SpriteCategory | 'all' | 'plants' | 'pets' = 'all'): Promise<string[]> {
	const tiles = Sprites.listAssetsForFamily('tiles');
	const urls = tiles.slice(0, Math.max(0, maxSheets));
	for (const url of urls) {
		await Sprites.loadSheetFromUrl?.(url);
	}
	return urls;
}

export function renderSpriteGridOverlay(sheetName = 'plants', maxTiles = 80): void {
	const container = document.createElement('div');
	container.style.cssText = `position: fixed; inset: 40px auto auto 40px; max-height: 80vh; max-width: 80vw; overflow: auto; padding: 16px; background: rgba(0, 0, 0, 0.9); border: 1px solid #444; border-radius: 10px; z-index: 999999; box-shadow: 0 12px 30px rgba(0,0,0,0.45);`;

	const header = document.createElement('div');
	header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;';
	header.innerHTML = `
		<div style="font-weight:700;color:#fff;">Sprite Grid: ${sheetName}</div>
		<button style="background:#222;color:#fff;border:1px solid #555;border-radius:6px;padding:4px 8px;cursor:pointer;">Close</button>
	`;
	header.querySelector('button')?.addEventListener('click', () => container.remove());
	container.appendChild(header);

	const grid = document.createElement('div');
	grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px;';

	let tilesRendered = 0;
	for (let i = 0; i < maxTiles; i++) {
		const tile = legacyGetTile(sheetName, i);
		if (!tile) continue;
		tilesRendered++;
		const wrapper = document.createElement('div');
		wrapper.style.cssText = 'background:#111;border:1px solid #333;border-radius:8px;padding:6px;text-align:center;';

		const label = document.createElement('div');
		label.textContent = `#${i}`;
		label.style.cssText = 'color:#999;font-size:11px;margin-bottom:4px;font-family:monospace;';

		const img = new Image();
		img.src = tile.toDataURL();
		img.style.cssText = 'width:64px;height:64px;image-rendering:pixelated;margin:auto;display:block;';

		wrapper.appendChild(label);
		wrapper.appendChild(img);
		grid.appendChild(wrapper);
	}

	if (tilesRendered === 0) {
		const empty = document.createElement('div');
		empty.textContent = 'No tiles available for this sheet yet.';
		empty.style.cssText = 'color:#ccc;font-size:13px;';
		container.appendChild(empty);
	} else {
		container.appendChild(grid);
	}

	document.body.appendChild(container);
}

export function renderAllSpriteSheetsOverlay(maxTilesPerSheet = 80): void {
	const sheetNames = Sprites.listTilesByCategory(/./).map((u) => fileBase(u));
	const unique = Array.from(new Set(sheetNames));
	if (!unique.length) {
		log('⚠️ No sprite sheets recorded yet.');
		return;
	}
	unique.forEach((name) => renderSpriteGridOverlay(name, maxTilesPerSheet));
}

export async function inspectPetSprites(): Promise<void> {
	const loaded = await loadTrackedSpriteSheets(5, 'all');
	if (loaded.length) log(`✅ Loaded ${loaded.length} sheet${loaded.length === 1 ? '' : 's'}.`);
	const summaries = getSheetSummaries().filter((s) => /pet|animal|creature|mob/i.test(`${s.name} ${s.url}`));
	if (!summaries.length) {
		log('❌ No processed pet sprite sheets yet. Move pets into view to force loads, then rerun.');
		return;
	}
	log('\n🐾 Extracted pet sprite sheets:');
	summaries.forEach((summary, idx) => {
		log(`   ${idx + 1}. ${summary.name} (${summary.tilesPerRow}x${summary.tilesPerColumn} tiles @ ${summary.tileSize}px)`);
		log(`      source: ${summary.url}`);
	});
}

// ----- Legacy compatibility mapping -----

type CropTileLookup = { sheet: 'plants' | 'allplants' | 'tallplants'; index: number };

function resolveCropTile(species: string): CropTileLookup | null {
	const key = toLowerKey(species);
	const tallRef = tallPlantTileRefs[key];
	if (typeof tallRef === 'number') return { sheet: 'tallplants', index: tallRef - 1 };
	const plantRef = plantTileRefs[key];
	if (typeof plantRef === 'number') return { sheet: 'plants', index: plantRef - 1 };
	return null;
}

function resolvePetTile(species: string): { index: number } | null {
	const key = toLowerKey(species);
	const tileRef = petTileRefs[key];
	if (typeof tileRef !== 'number') {
		// Only log missing pets once
		if (!key.includes('object')) {
			console.warn('[QPM Sprite] Pet not found:', species, '→', key);
		}
		return null;
	}
	// CRITICAL: tileRefs are 1-based (Bee=1), sprite sheet indices are 0-based (Bee=0)
	const index = tileRef - 1;
	return { index };
}

function resolveSeedTile(seedName: string): { index: number } | null {
	const key = toLowerKey(seedName);
	const tileRef = seedTileRefs[key];
	if (typeof tileRef !== 'number') return null;
	return { index: tileRef - 1 };
}

function resolveItemTile(itemName: string): { index: number } | null {
	const key = toLowerKey(itemName);
	const tileRef = itemTileRefs[key];
	if (typeof tileRef !== 'number') return null;
	return { index: tileRef - 1 };
}

// ----- Export sprite sheet debug helpers -----

export function listTrackedSpriteResources(_category: SpriteCategory | 'all' | 'plants' | 'pets' = 'all'): Array<{ url: string; families: string[] }> {
	const lists = Sprites.lists();
	const tiles = lists.tiles || [];
	return tiles.map((url) => ({ url, families: ['tiles'] }));
}

export function getSheetSummaries(): Array<{ name: string; url: string; tileSize: number; tilesPerRow: number; tilesPerColumn: number }> {
	const summaries: Array<{ name: string; url: string; tileSize: number; tilesPerRow: number; tilesPerColumn: number }> = [];
	(Sprites as any).tileCacheCanvas?.forEach?.((tiles: TileInfo<HTMLCanvasElement>[] | undefined, url: string) => {
		if (!tiles || !tiles.length) return;
		const base = fileBase(url);
		const first = tiles[0];
		if (!first) return;
		const size = first.size;
		const cols = Math.max(...tiles.map((t) => t.col)) + 1;
		const rows = Math.max(...tiles.map((t) => t.row)) + 1;
		summaries.push({ name: base, url, tileSize: size, tilesPerRow: cols, tilesPerColumn: rows });
	});
	return summaries;
}

// Initialize immediately so default sheets begin loading
initSprites();
DEFAULT_SHEETS.forEach(({ url, alias, forceSize }) => { void Sprites.registerKnownAsset(url, ['tiles']); void Sprites.loadSheetFromUrl?.(url, alias, forceSize); });

// Lightweight loadSheetFromUrl wrapper to mirror old API
Sprites.loadSheetFromUrl = async (url: string, alias?: string, forceSize?: 256 | 512): Promise<boolean> => {
	const abs = normalizeUrl(url);
	Sprites.registerKnownAsset(abs, ['tiles']);
	try {
		await (Sprites as any).ensureTilesForUrl(abs, { mode: 'canvas', includeBlanks: false, forceSize });
		return true;
	} catch (error) {
		log(`⚠️ Failed to load sprite sheet from ${url}`, error);
		return false;
	}
};

// ----- Legacy compatibility surface (sync-ish helpers) -----

function findUrlForSheet(sheet: string): string | null {
	const tiles: Set<string> | undefined = (Sprites as any).familyAssets?.get?.('tiles');
	if (!tiles) return null;
	for (const url of tiles) {
		if (fileBase(url) === sheet) return url;
	}
	return null;
}

function getTileFromCache(sheet: string, index: number): HTMLCanvasElement | null {
	const url = findUrlForSheet(sheet);
	if (!url) return null;
	const cache: Map<string, TileInfo<HTMLCanvasElement>[]> | undefined = (Sprites as any).tileCacheCanvas;
	const arr = cache?.get(url);
	if (!arr || !arr.length) return null;
	const tile = arr.find((t) => t.index === index);
	return tile ? (tile.data as HTMLCanvasElement) : null;
}

function kickAsyncLoad(sheet: string, index: number): void {
	const url = findUrlForSheet(sheet);
	if (!url) return;
	void (Sprites as any).ensureTilesForUrl?.(url, { mode: 'canvas', includeBlanks: false });
	void Sprites.getTile(sheet, index, 'canvas');
}

function legacyGetTile(sheet: string, index: number): HTMLCanvasElement | null {
	const cached = getTileFromCache(sheet, index);
	if (cached) return cached;
	kickAsyncLoad(sheet, index);
	return getTileFromCache(sheet, index);
}

function legacyGetCropSprite(species: string): HTMLCanvasElement | null {
	const resolved = resolveCropTile(species);
	if (!resolved) return null;
	const base = legacyGetTile(resolved.sheet, resolved.index);
	if (base) return base;
	const fromAll = legacyGetTile('allplants', resolved.index);
	if (fromAll) return fromAll;
	kickAsyncLoad(resolved.sheet, resolved.index);
	kickAsyncLoad('allplants', resolved.index);
	return null;
}

function legacyGetCropSpriteByTileId(tileId: string | number | null | undefined): HTMLCanvasElement | null {
	if (tileId == null) return null;
	const tileRef = typeof tileId === 'number' ? tileId : parseInt(String(tileId).replace(/[^0-9-]/g, ''), 10);
	if (!Number.isFinite(tileRef) || tileRef <= 0) return null;
	const idx = tileRef - 1;
	const isTall = tallPlantTileRefValues.has(tileRef);
	if (isTall) {
		const fromTall = legacyGetTile('tallplants', idx);
		if (fromTall) return fromTall;
	}
	const fromPlants = legacyGetTile('plants', idx);
	if (fromPlants) return fromPlants;
	const fromAll = legacyGetTile('allplants', idx);
	if (fromAll) return fromAll;
	if (isTall) kickAsyncLoad('tallplants', idx);
	kickAsyncLoad('plants', idx);
	kickAsyncLoad('allplants', idx);
	return null;
}

function legacyGetPetSprite(species: string): HTMLCanvasElement | null {
	const resolved = resolvePetTile(species);
	if (!resolved) return null;
	const { index } = resolved;
	const canvas = legacyGetTile('pets', index) || legacyGetTile('animals', index) || legacyGetTile('creatures', index) || legacyGetTile('mobs', index);
	kickAsyncLoad('pets', index);
	return canvas;
}

export function legacyGetSeedSprite(seedName: string): HTMLCanvasElement | null {
	const resolved = resolveSeedTile(seedName);
	if (!resolved) return null;
	const canvas = legacyGetTile('seeds', resolved.index);
	kickAsyncLoad('seeds', resolved.index);
	return canvas;
}

export function legacyGetItemSprite(itemName: string): HTMLCanvasElement | null {
	const resolved = resolveItemTile(itemName);
	if (!resolved) return null;
	const canvas = legacyGetTile('items', resolved.index);
	kickAsyncLoad('items', resolved.index);
	return canvas;
}

function legacyRenderPlantWithMutations(base: HTMLCanvasElement, mutations: string[]): HTMLCanvasElement {
	const icons: Record<string, MutationIconTile> = {};
	const overlays: Record<string, MutationIconTile> = {};
	const tileSize = base.width || 1;
	const isTall = base.height > base.width;

	const cap = (k: string): string => k.charAt(0).toUpperCase() + k.slice(1);

	for (const [rawKey, idx] of Object.entries(MUTATION_TILE_MAP)) {
		const index = idx > 0 ? idx - 1 : idx; // tileRefs are 1-based
		const tile = legacyGetTile('mutations', index);
		if (!tile) continue;
		const key = cap(rawKey);
		const logical =
			key === 'Amberlit'
				? 'Ambershine'
				: key === 'Dawnbound'
					? 'Dawncharged'
					: key === 'Amberbound'
						? 'Ambercharged'
						: key;
		const icon: MutationIconTile = {
			tile: { sheet: 'mutations', url: 'cache', index, col: 0, row: 0, size: tile.width, data: tile },
		};
		icons[key] = icon;
		icons[logical] = icon;
	}

	for (const [rawKey, idx] of Object.entries(MUTATION_OVERLAY_TILE_MAP)) {
		const tile = legacyGetTile('mutation-overlays', idx);
		if (!tile) continue;
		const tallKey = rawKey.toLowerCase().includes('tallplant');
		const baseKey = tallKey ? rawKey.replace(/tallplant/i, '') : rawKey;
		const key = tallKey ? `${cap(baseKey)}TallPlant` : cap(baseKey);
		overlays[key] = { tile: { sheet: 'mutation-overlays', url: 'cache', index: idx, col: 0, row: 0, size: tile.width, data: tile }, opacity: 0.8 };
	}

	const baseTile: TileInfo<HTMLCanvasElement> = { sheet: 'cache', url: 'inline', index: 0, col: 0, row: 0, size: base.width, data: base };
	return Sprites.renderPlantWithMutationsNonTall({ baseTile, mutations, mutationIcons: icons, mutationOverlayTiles: overlays, isTall });
}

export const spriteExtractor = {
	getTile: legacyGetTile,
	getCropSprite: legacyGetCropSprite,
	getCropSpriteByTileId: legacyGetCropSpriteByTileId,
	getSeedSprite: legacyGetSeedSprite,
	getPetSprite: legacyGetPetSprite,
	renderPlantWithMutations: legacyRenderPlantWithMutations,
	loadSheetFromUrl: Sprites.loadSheetFromUrl,
	init: (): void => { initSprites(); },
} as const;

