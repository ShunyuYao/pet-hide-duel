# Pet Hide Duel

A two-player LAN hide-and-seek duel with 2D pets and frontal 3D doll posing. **2.0.2** is the single maintained version. The self-contained `躲猫猫对决.html` requires no CDN.

[Download the game and LAN bundle](https://github.com/ShunyuYao/pet-hide-duel/releases/latest) · [中文](README.md) · [Validation](docs/VALIDATION.md)

## Play

**In a compatible desktop pet host:** connect both players to the same LAN, send the HTML using “Send and play together,” and accept the invitation. Confirm pairing codes and character permission on first use. Choose an initial pose, join, and ready up. Share-only does not create an invitation. Keep the host player's game page open.

Required host capabilities are `character.getCurrent`, `sessions`, and their permissions. 3D also requires `character.getRealtime`; older installed hosts may lack these capabilities. This repository distributes the game only, with no host installers or host download locations.

**In a browser:** download and extract `pet-hide-duel-lan.zip` from Releases. The hosting computer needs Node.js 22+. Run `启动局域网.command` on macOS, `启动局域网.cmd` on Windows, or `node launch-server.cjs`. Both players open the printed LAN address and upload transparent 2D PNG/WebP artwork. One creates a room and shares its room code. Keep the service running. Use a trusted LAN; do not expose the service to the public internet. Opening the HTML alone does not establish a multiplayer connection.

## Rules

Choose a 2D pose or adjust and confirm a frontal 3D doll pose in the lobby. Pose and size lock on admission. A/D, arrow keys, or buttons move the hider horizontally. Rotation uses 15-degree increments with a one-second cooldown. Click the wall to shoot, or aim with arrow keys and fire with Space. Each turn has a three-second preparation, twenty-second shooting phase and three bullets. Each player starts with 100 HP; a hit deals 34 damage. Hits, empty ammo, or timeout swap roles. Holes persist. A match lasts at most six minutes. Both players can request a rematch. Disconnections pause play and forfeit after thirty seconds; leaving forfeits immediately.

3D currently supports male/female `rat-doll-renderer` data v2, not arbitrary model imports. The confirmed frontal pixels are shared by drawing, occlusion, and hit detection. Full 3D assets are not sent during matches. Poses persist in the work's local storage. No photos or character packs are included in this repository.

## Known limitations

Local hider movement and aiming render each frame and reconcile after release. **The opponent's fragments visible through holes still update with network snapshots and may visibly step.** That optimization remains open. Both peers must use the same version; historical HTTP / SDK v1 files are incompatible.

Two isolated real host processes on one machine have been tested. Physical two-computer play, native Windows startup, firewall differences, and internet play have not been validated.

## Development

With Node.js 22+:

```sh
npm ci
npm run build
npm run test:public
npm start
```

`game/` contains game sources; `vendor/` contains bundled rendering components; `server.cjs` is the optional LAN service. `build:check` verifies committed HTML matches source and notices. Building, core/network/service tests, and the browser server do not require the private host.

Real-host E2E tests require a runnable host checkout selected by `PET_DUEL_HOST_REPO`. 3D tests additionally require `PET_DUEL_PACKS_DIR` containing local male/female unpacked doll fixtures and `rat-doll-male.zip`. Missing dependencies fail explicitly rather than passing as skipped tests. See [validation](docs/VALIDATION.md).

Original game code remains all rights reserved; public visibility does not grant an additional open-source license. Third-party components retain their licenses; see [notices](THIRD_PARTY_NOTICES.md). Full runtime notices are embedded in the HTML.
