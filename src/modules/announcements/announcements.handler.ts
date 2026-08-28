// Announcements have no client-initiated WS events — delivery is entirely server-driven
// (REST create/approve triggers it, the countdown job triggers the "live" reminder). This
// file's only job is exporting the one deliberate exception to "rooms are always opt-in":
// every authenticated socket auto-joins this room at connect time (see websocket.server.ts),
// so an "everyone" announcement can fan out via the existing Redis room broadcast without
// every client having to send an explicit join event first.
export const ANNOUNCEMENTS_ROOM = 'announcements:global';
