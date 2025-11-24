import { WeatherAtomValue, ShopsAtomSnapshot, ShopPurchasesAtomSnapshot, ShopCategorySnapshot } from '../types/gameAtoms';
type AtomPath = string | readonly (string | number)[];
interface AtomDescriptor<TValue> {
    label: string;
    path?: AtomPath;
    transform?: (value: unknown) => TValue;
    fallback?: TValue;
}
type AtomDescriptorMap = {
    weather: AtomDescriptor<WeatherAtomValue>;
    shops: AtomDescriptor<ShopsAtomSnapshot | null>;
    seedShop: AtomDescriptor<ShopCategorySnapshot | null>;
    eggShop: AtomDescriptor<ShopCategorySnapshot | null>;
    toolShop: AtomDescriptor<ShopCategorySnapshot | null>;
    decorShop: AtomDescriptor<ShopCategorySnapshot | null>;
    shopPurchases: AtomDescriptor<ShopPurchasesAtomSnapshot | null>;
};
export type AtomRegistryKey = keyof AtomDescriptorMap;
type AtomValueMap = {
    weather: WeatherAtomValue;
    shops: ShopsAtomSnapshot | null;
    seedShop: ShopCategorySnapshot | null;
    eggShop: ShopCategorySnapshot | null;
    toolShop: ShopCategorySnapshot | null;
    decorShop: ShopCategorySnapshot | null;
    shopPurchases: ShopPurchasesAtomSnapshot | null;
};
type RegistryValue<K extends AtomRegistryKey> = AtomValueMap[K] | null;
export declare function readAtomValue<K extends AtomRegistryKey>(key: K): Promise<RegistryValue<K>>;
export declare function subscribeAtomValue<K extends AtomRegistryKey>(key: K, cb: (value: RegistryValue<K>) => void): Promise<() => void>;
export {};
//# sourceMappingURL=atomRegistry.d.ts.map