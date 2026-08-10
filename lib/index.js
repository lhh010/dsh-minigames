//#region src/index.ts
/** Stable Cordis plugin name (the loader row id). */
const name = "dsh-minigames";
/**
* Activate the node half: log the activation so a loaded-but-invisible row
* is diagnosable; everything else lives in the client bundle.
* @param ctx - plugin context.
*/
function apply(ctx) {
	ctx.logger.info("[dsh-minigames] node half active; the game panel mounts in the browser");
}
//#endregion
export { apply, name };
