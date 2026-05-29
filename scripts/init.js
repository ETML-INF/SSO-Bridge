#!/usr/bin/env node

const { runStarter, frameworks } = require("./starter");

function parseArgs(argv) {
  const options = {
    force: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--force" || arg === "-f") {
      options.force = true;
      continue;
    }

    if (arg === "--framework" || arg === "--template") {
      options.framework = String(argv[index + 1] || "").trim().toLowerCase();
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
  }

  return options;
}

function printHelp() {
  const supported = Object.entries(frameworks)
    .map(([key, framework]) => `- ${key}: ${framework.label}`)
    .join("\n");

  console.log([
    "SSO Bridge starter",
    "",
    "Usage:",
    "  sso-bridge-init [--framework <name>] [--force]",
    "",
    "Frameworks supportés:",
    supported,
    "",
    "Examples:",
    "  npx sso-bridge-init",
    "  npx sso-bridge-init --framework express",
    "  npx sso-bridge-init --framework adonis --force",
  ].join("\n"));
}

async function main() {
  const options = parseArgs(process.argv);

  if (options.help) {
    printHelp();
    return;
  }

  try {
    const result = await runStarter(options);

    if (result.skipped) {
      return;
    }

    const files = result.createdFiles.length ? result.createdFiles.join("\n- ") : "(aucun nouveau fichier)";
    console.log(`\nStarter généré pour ${result.framework}.\nFichiers créés:\n- ${files}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();