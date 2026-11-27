/**
 * Two fixes that have to happen after `pod install` has finished writing files.
 *
 * Doing them from the Podfile's `post_install` is not enough: CocoaPods rewrites
 * the Pods project and the header maps afterwards, which undoes both.
 *
 * 1. React Native 0.86 ships prebuilt folly headers without `folly/coro/`, while
 *    `folly/Expected.h` includes `folly/coro/Coroutine.h` whenever coroutines are
 *    available — with C++20 that is always. Defining folly's own switch in the
 *    header (all four copies under Pods) turns the feature off.
 * 2. Four build configurations in the Pods project still carry a deployment
 *    target from the podspecs (4.3 / 11.0). Xcode 27 refuses anything below 15.0,
 *    so they are raised to the app's 15.1.
 *
 * Run from `postinstall` and by hand after `pod install`.
 */
const fs = require('fs');
const path = require('path');

const iosDir = path.join(__dirname, '..', 'ios');
const podsDir = path.join(iosDir, 'Pods');
if (!fs.existsSync(podsDir)) {
  process.exit(0); // pods not installed on this machine
}

const DEFINE = '#define FOLLY_CFG_NO_COROUTINES 1\n';

function patchFollyHeaders(dir) {
  let patched = 0;
  const seen = new Set();
  const walk = current => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === 'Portability.h' && full.includes('/folly/')) {
        // Several of these are symlinks into the xcframework, and the ones under
        // Headers/Private are read-only: resolve first and patch each real file
        // once.
        let real;
        try {
          real = fs.realpathSync(full);
        } catch {
          continue;
        }
        if (seen.has(real)) {
          continue;
        }
        seen.add(real);
        try {
          // Some copies come out of the pod as read-only (0444).
          fs.chmodSync(real, 0o644);
          const header = fs.readFileSync(real, 'utf8');
          if (!header.startsWith(DEFINE)) {
            fs.writeFileSync(real, DEFINE + header);
            patched += 1;
          }
        } catch (error) {
          console.warn(`patch-ios-pods: skipped ${real}: ${error.code}`);
        }
      }
    }
  };
  walk(dir);
  return patched;
}

function raiseDeploymentTargets() {
  const projectFiles = [
    path.join(podsDir, 'Pods.xcodeproj', 'project.pbxproj'),
    path.join(iosDir, 'KmpPlaygroundRn.xcodeproj', 'project.pbxproj'),
  ];
  let changed = 0;
  for (const file of projectFiles) {
    if (!fs.existsSync(file)) {
      continue;
    }
    const before = fs.readFileSync(file, 'utf8');
    const after = before.replace(
      /IPHONEOS_DEPLOYMENT_TARGET = [0-9.]+;/g,
      'IPHONEOS_DEPLOYMENT_TARGET = 15.1;',
    );
    if (after !== before) {
      fs.writeFileSync(file, after);
      changed += 1;
    }
  }
  return changed;
}

console.log(`patch-ios-pods: ${patchFollyHeaders(podsDir)} folly header(s)`);
console.log(`patch-ios-pods: ${raiseDeploymentTargets()} project(s) at iOS 15.1`);
