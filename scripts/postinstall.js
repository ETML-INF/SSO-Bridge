const { spawn } = require("child_process");
const path = require("path");
const { runStarter } = require("./starter");

function getProjectRoot() {
  return path.resolve(process.env.INIT_CWD || process.env.npm_config_local_prefix || process.cwd());
}

function launchInteractiveWizard() {
  const initScript = path.resolve(__dirname, "init.js");

  if (process.platform === "win32") {
    const child = spawn(
      "cmd.exe",
      ["/c", "start", "", process.execPath, initScript],
      {
        cwd: getProjectRoot(),
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      }
    );

    child.unref();
    return true;
  }

  return false;
}

runStarter({ defaultFramework: "adonis" })
  .then((result) => {
    if (result?.skipped && result.reason === "non-interactive") {
      const launched = launchInteractiveWizard();
      if (!launched) {
        console.log("SSO Bridge starter: lance manuellement `npx sso-bridge-init` pour choisir un framework.");
      }
    }
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });