/**
 * Pre-build script: runs all setup tasks required before `next build`.
 * Add future build preparation steps here.
 */
import './check-we-meet-token-alignment.mjs';
import './sync-we-meet-ui.mjs';
import './copy-emoji.mjs';
