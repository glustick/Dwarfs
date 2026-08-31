// ---- Version -----------------------------------------------------------------
// RELEASE_VERSION: semantic version (major.minor.patch), bumped whenever a
//   named feature round ships — see CHANGELOG.md for what each release added.
// BUILD_NUMBER: a plain counter, +1 on every commit. Independent of the
//   release cadence — handy for support ("what build are you running").
//
// Bump both by hand as part of shipping a change: BUILD_NUMBER always,
// RELEASE_VERSION when the change is a user-facing feature/enhancement round.
const RELEASE_VERSION = "1.2.0";
const BUILD_NUMBER = 17;
