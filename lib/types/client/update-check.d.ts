export declare const PLUGIN_VERSION: string;
export declare const MIRROR = "lhh010/dsh-minigames";
export declare const UPDATE_ID = "dsh-minigames";
export declare const PACKAGE_SPEC = "@dsh-external/dsh-minigames";
export declare function compareSemver(a: string, b: string): number;
export declare function fetchLatestTag(): Promise<string | undefined>;
export declare function updatePrompt(tag: string): string;
export interface UpdateResult {
    readonly ok: boolean;
    readonly detail: string;
    readonly link?: boolean;
}
export declare function runUpdate(tag: string): Promise<UpdateResult>;
