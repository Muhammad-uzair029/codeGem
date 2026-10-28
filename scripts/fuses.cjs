// electron-builder afterPack hook: flip Electron fuses on the packaged
// binary so a shipped app can't be turned into a generic Node runtime,
// attached to with a debugger, or run with a tampered app.asar.
// https://www.electronjs.org/docs/latest/tutorial/fuses
const { join } = require('node:path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

module.exports = async function afterPack(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  const name = packager.appInfo.productFilename;
  const binaryFor = {
    darwin: () => join(appOutDir, `${name}.app`, 'Contents', 'MacOS', name),
    win32: () => join(appOutDir, `${name}.exe`),
    linux: () => join(appOutDir, packager.executableName),
  }[electronPlatformName];
  if (!binaryFor) throw new Error(`fuses: unsupported platform ${electronPlatformName}`);
  const binary = binaryFor();

  await flipFuses(binary, {
    version: FuseVersion.V1,
    // Flipping fuses invalidates the ad-hoc signature Apple Silicon needs to
    // launch an unsigned app; re-sign ad-hoc (real signing happens later).
    resetAdHocDarwinSignature: electronPlatformName === 'darwin',
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    // electron-builder writes the asar hash into Info.plist on macOS; it
    // doesn't embed one for Windows/Linux in this version, so only enforce
    // integrity where the hash exists (otherwise the app would refuse to start).
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: electronPlatformName === 'darwin',
  });
  console.log(`  • fuses flipped  platform=${electronPlatformName} binary=${binary}`);
};
