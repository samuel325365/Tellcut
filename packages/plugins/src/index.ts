// The single list of plugins (review B3: a package of its own), shared by the player, the editor, the server and the tools.
// The early sample films' plugins (wedding, kyoto, red-earth, notebook, pokemon) were removed with those films on 2026-10-18.
import { corePlugin, type Plugin } from '@tellcut/engine';
import { commonPlugin } from '@tellcut/plugin-common';
/** three.js for the projects that use it (usesThree): the player loads it before building the stage */
export { loadThreeKit, type ThreeKit } from '@tellcut/plugin-common';

export const plugins: Plugin[] = [corePlugin, commonPlugin];
