export declare const PLUGIN_VERSION: string;
export declare const MIRROR = "lhh010/dsh-minigames";
export declare const UPDATE_ID = "dsh-minigames";
export declare const PACKAGE_SPEC = "@dsh-external/dsh-minigames";
export declare function compareSemver(a: string, b: string): number;
export interface UpdateInfo {
    readonly latest: string;
    /** Running DSH version; undefined when the host endpoint did not report it. */
    readonly dshVersion?: string | undefined;
    /** Newest tag whose compatibility data covers dshVersion; undefined when unknown. */
    readonly latestSupported?: string | undefined;
    /** True when the compatibility map was reachable and parsed. */
    readonly compat?: boolean | undefined;
}
export declare function fetchUpdateInfo(): Promise<UpdateInfo | undefined>;
export type UpdateNotice = {
    readonly kind: 'current';
    readonly tag: string;
} | {
    readonly kind: 'available';
    readonly tag: string;
} | {
    readonly kind: 'partial';
    readonly tag: string;
    readonly blocked: string;
    readonly dshVersion: string;
} | {
    readonly kind: 'blocked';
    readonly tag: string;
    readonly dshVersion: string;
};
/** Decide the update-chip message from the local version and the gated remote info. */
export declare function decideUpdate(local: string, info: UpdateInfo): UpdateNotice;
export declare function fetchLatestTag(): Promise<string | undefined>;
export declare function updatePrompt(tag: string): string;
export interface UpdateResult {
    readonly ok: boolean;
    readonly detail: string;
    readonly link?: boolean;
    readonly recovery?: string;
    readonly hostChanged?: boolean;
}
export declare function runUpdate(tag: string): Promise<UpdateResult>;
