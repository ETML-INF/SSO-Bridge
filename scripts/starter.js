const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const readline = require("readline/promises");
const tty = require("tty");

const frameworks = {
  adonis: {
    label: "AdonisJS",
    description: "Service, controller et routes Adonis prêtes a brancher",
    files: {
      "app/Services/SsoService.ts": `// On définit l'interface pour avoir l'autocomplétion et éviter les erreurs
interface SsoBridge {
  generateCorrelationId(): Promise<string>
  buildLoginRedirectUrl(correlationId: string, callbackUrl: string): string
  buildLogoutRedirectUrl(redirectUrl: string): string
  retrieveLoginInfo(correlationId: string): Promise<{
    email: string
    username: string
    error?: string
    isSuccess: () => boolean
  }>
}

/**
 * Initialise le bridge avec les clés du .env
 */
export function createBridgeFromEnv(): SsoBridge {
  const apiKey = env.get('API_KEY') // Ta clé secrète pour parler au bridge
  const ssoPortal = normalizeSsoPortal(env.get('SSO_PORTAL'))

  if (!apiKey) {
    throw new Error('API_KEY (Bridge Token) manquante dans le .env')
  }

  if (!ssoPortal) {
    throw new Error('SSO_PORTAL manquante dans le .env')
  }

  return ssoBridgePackage.createSSOBridge({
    apiKey: apiKey,
    ssoPortal: ssoPortal,
  })
}

function normalizeSsoPortal(raw?: string) {
  if (!raw) return undefined

  const trimmed = String(raw).trim()
  if (!trimmed) return undefined

  const withoutTrailingSlash = trimmed.replace(/\/+$/, '')
  const hasAuthSegment = /\/auth(?:\/|$)/.test(withoutTrailingSlash)
  const base = hasAuthSegment ? withoutTrailingSlash : withoutTrailingSlash + '/auth'
  return base + '/'
}

export function createAdonisSsoFlowFromEnv(options: any = {}) {
  const bridge = createBridgeFromEnv() as any
  const config = {
    callbackPath: '/sso/callback',
    afterLogoutPath: '/',
    loginPath: '/sso/login',
    logoutPath: '/sso/logout',
    successRedirect: '/home',
    failureRedirect: '/login',
    authGuard: 'web',
    ...options,
  }

  return {
    async status(ctx: any) {
      return ctx.response.send({
        ok: true,
        loginPath: config.loginPath,
        callbackPath: config.callbackPath,
        logoutPath: config.logoutPath,
        successRedirect: config.successRedirect,
        failureRedirect: config.failureRedirect,
        authGuard: config.authGuard,
      })
    },

    async loginRedirect({ response, request, session }: any) {
      const correlationId = await bridge.generateCorrelationId()
      writeSession(session, 'sso_bridge_correlation_id', correlationId)

      const callbackUrl = buildAbsoluteUrl(request, config.callbackPath)
      const redirectUrl = bridge.buildLoginRedirectUrl(correlationId, callbackUrl)

      return response.redirect(redirectUrl)
    },

    async callbackLogin(ctx: any, createUser: (payload: any) => Promise<any>) {
      const correlationId = readSession(ctx.session, 'sso_bridge_correlation_id')
      const ssoResult = await bridge.retrieveLoginInfo(correlationId)
      const payload = {
        ...ssoResult,
        correlationId,
        raw: ssoResult,
      }

      if (!ssoResult.isSuccess()) {
        return ctx.response.redirect(config.failureRedirect)
      }

      const user = await createUser(payload)
      await ctx.auth.use(config.authGuard).login(user)

      return ctx.response.redirect(config.successRedirect)
    },

    async logout({ auth, response, request }: any) {
      await auth.use(config.authGuard).logout()

      const redirectUrl = buildAbsoluteUrl(request, config.afterLogoutPath)
      return response.redirect(bridge.buildLogoutRedirectUrl(redirectUrl))
    },
  }
}

function readSession(session: any, key: string) {
  if (typeof session?.get === 'function') {
    return session.get(key)
  }

  return undefined
}

function writeSession(session: any, key: string, value: string) {
  if (typeof session?.put === 'function') {
    session.put(key, value)
    return
  }

  if (typeof session?.set === 'function') {
    session.set(key, value)
  }
}

function buildAbsoluteUrl(request: any, path: string) {
  const protocol = typeof request?.protocol === 'function' ? request.protocol() : 'http'
  const host = typeof request?.host === 'function' ? request.host() : 'localhost'
  return new URL(protocol + '://' + host + path).toString()
}
`,
      "app/Controllers/Http/SsoController.ts": `export default class SsoController {
  private flow() {
    return createAdonisSsoFlowFromEnv()
  }

  /**
   * Route de test SSO : GET /sso/test
   * Affiche un état simple et les liens SSO utiles.
   */
  public async status(ctx: HttpContext) {
    return this.flow().status(ctx as any)
  }

  /**
   * PHASE 1 : Redirection vers le portail SSO
   */
  public async loginRedirect({ response, request, session }: HttpContext) {
    return this.flow().loginRedirect({ response, request, session } as any)
  }

  /**
   * PHASE 2 : Retour du portail SSO & Validation
   */
  public async callback(ctx: HttpContext) {
    return this.flow().callbackLogin(ctx as any, (payload: SsoResult) =>
      this.findOrCreateSsoUser(payload)
    )
  }

  /**
   * PHASE 3 : Déconnexion (Locale + Portail)
   */
  public async logout({ auth, response, request, session }: HttpContext) {
    return this.flow().logout({ auth, response, request, session } as any)
  }
}
`,
    },
  },
  express: {
    label: "Express",
    description: "Route de base et bootstrap Express",
    files: {
      "src/sso.js": `const { createSSOBridge, createAdonisSSOHandlers } = require("sso-bridge");
const config = require("../sso-bridge.config");

const bridge = createSSOBridge(config);

function createExpressSsoHandlers() {
  const adonisStyleHandlers = createAdonisSSOHandlers(bridge, {
    callbackPath: "/sso/callback",
    afterLogoutPath: "/",
  });

  return {
    bridge,
    loginRedirect: adonisStyleHandlers.loginRedirect,
    callback: adonisStyleHandlers.callback,
    logout: adonisStyleHandlers.logout,
  };
}

module.exports = {
  bridge,
  createExpressSsoHandlers,
};
`,
      "src/server.js": `const express = require("express");
const { createExpressSsoHandlers } = require("./sso");

const app = express();
const sso = createExpressSsoHandlers();

app.get("/sso/login", (req, res) => sso.loginRedirect({ request: req, response: res, session: req.session }));
app.get("/sso/callback", (req, res) => sso.callback({ request: req, response: res, session: req.session }));
app.get("/sso/logout", (req, res) => sso.logout({ request: req, response: res, auth: req.auth }));

module.exports = app;
`,
    },
  },
  fastify: {
    label: "Fastify",
    description: "Plugin de routes Fastify",
    files: {
      "src/sso.js": `const { createSSOBridge, createAdonisSSOHandlers } = require("sso-bridge");
const config = require("../sso-bridge.config");

const bridge = createSSOBridge(config);

async function ssoPlugin(fastify) {
  const handlers = createAdonisSSOHandlers(bridge, {
    callbackPath: "/sso/callback",
    afterLogoutPath: "/",
  });

  fastify.get("/sso/login", async (request, reply) =>
    handlers.loginRedirect({ request, response: reply, session: request.session })
  );
  fastify.get("/sso/callback", async (request, reply) =>
    handlers.callback({ request, response: reply, session: request.session })
  );
  fastify.get("/sso/logout", async (request, reply) =>
    handlers.logout({ request, response: reply, auth: request.auth })
  );
}

module.exports = {
  bridge,
  ssoPlugin,
};
`,
    },
  },
  nest: {
    label: "NestJS",
    description: "Service et controller NestJS",
    files: {
      "src/sso/sso.service.js": `const { createSSOBridge } = require("sso-bridge");
const config = require("../../sso-bridge.config");

class SsoService {
  constructor() {
    this.bridge = createSSOBridge(config);
  }

  getBridge() {
    return this.bridge;
  }
}

module.exports = {
  SsoService,
};
`,
      "src/sso/sso.controller.js": `const { createAdonisSSOHandlers } = require("sso-bridge");

class SsoController {
  constructor(ssoService) {
    this.handlers = createAdonisSSOHandlers(ssoService.getBridge(), {
      callbackPath: "/sso/callback",
      afterLogoutPath: "/",
    });
  }

  loginRedirect(ctx) {
    return this.handlers.loginRedirect(ctx);
  }

  callback(ctx) {
    return this.handlers.callback(ctx);
  }

  logout(ctx) {
    return this.handlers.logout(ctx);
  }
}

module.exports = {
  SsoController,
};
`,
    },
  },
  koa: {
    label: "Koa",
    description: "Middleware et routes Koa",
    files: {
      "src/sso.js": `const { createSSOBridge, createAdonisSSOHandlers } = require("sso-bridge");
const config = require("../sso-bridge.config");

const bridge = createSSOBridge(config);
const handlers = createAdonisSSOHandlers(bridge, {
  callbackPath: "/sso/callback",
  afterLogoutPath: "/",
});

function registerSsoRoutes(router) {
  router.get("/sso/login", async (ctx) => handlers.loginRedirect(ctx));
  router.get("/sso/callback", async (ctx) => handlers.callback(ctx));
  router.get("/sso/logout", async (ctx) => handlers.logout(ctx));
}

module.exports = {
  bridge,
  registerSsoRoutes,
};
`,
    },
  },
};

function getProjectRoot() {
  return path.resolve(process.env.INIT_CWD || process.env.npm_config_local_prefix || process.cwd());
}

function getPackageRoot() {
  return path.resolve(__dirname, "..");
}

function getSentinelPath(projectRoot) {
  return path.join(projectRoot, ".sso-bridge", "starter.json");
}

async function pathExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function ensureDirectory(filePath) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeFileIfMissing(filePath, contents) {
  if (await pathExists(filePath)) {
    return false;
  }

  await ensureDirectory(filePath);
  await fsp.writeFile(filePath, contents, "utf8");
  return true;
}

async function updateAdonisRoutes(projectRoot) {
  const routeLines = [
    'Route.get("/sso/login", "SsoController.loginRedirect")',
    'Route.get("/sso/callback", "SsoController.callback")',
    'Route.get("/sso/logout", "SsoController.logout")',
  ];
  const routesCandidates = [
    path.join(projectRoot, "start", "routes.ts"),
    path.join(projectRoot, "start", "routes.js"),
  ];

  const existingRoutesFile = routesCandidates.find((candidate) => fs.existsSync(candidate));
  const targetPath = existingRoutesFile || routesCandidates[1];

  if (!existingRoutesFile) {
    const content = [
      "// start/routes.js",
      'const Route = use("Route")',
      "",
      ...routeLines,
      "",
    ].join("\n");
    await writeFileIfMissing(targetPath, content);
    return { path: targetPath, created: true };
  }

  const existingContent = await fsp.readFile(targetPath, "utf8");
  const missingLines = routeLines.filter((line) => !existingContent.includes(line));

  if (missingLines.length === 0) {
    return { path: targetPath, created: false, updated: false };
  }

  const separator = existingContent.endsWith("\n") ? "" : "\n";
  await fsp.writeFile(targetPath, `${existingContent}${separator}\n${missingLines.join("\n")}\n`, "utf8");
  return { path: targetPath, created: false, updated: true };
}

function openTerminalStreams() {
  try {
    if (process.platform === "win32") {
      const inputFd = fs.openSync("\\\\.\\CONIN$", "r");
      const outputFd = fs.openSync("\\\\.\\CONOUT$", "w");

      return {
        input: new tty.ReadStream(inputFd),
        output: new tty.WriteStream(outputFd),
        close() {
          try {
            this.input.destroy();
          } catch (_error) {}
          try {
            this.output.destroy();
          } catch (_error) {}
          try {
            fs.closeSync(inputFd);
          } catch (_error) {}
          try {
            fs.closeSync(outputFd);
          } catch (_error) {}
        },
      };
    }

    const inputFd = fs.openSync("/dev/tty", "r");
    const outputFd = fs.openSync("/dev/tty", "w");

    return {
      input: new tty.ReadStream(inputFd),
      output: new tty.WriteStream(outputFd),
      close() {
        try {
          this.input.destroy();
        } catch (_error) {}
        try {
          this.output.destroy();
        } catch (_error) {}
        try {
          fs.closeSync(inputFd);
        } catch (_error) {}
        try {
          fs.closeSync(outputFd);
        } catch (_error) {}
      },
    };
  } catch (_error) {
    return null;
  }
}

async function promptFramework(defaultFramework = "adonis") {
  const terminalStreams = openTerminalStreams();
  const input = terminalStreams?.input || process.stdin;
  const output = terminalStreams?.output || process.stdout;

  const frameworkList = Object.entries(frameworks)
    .map(([key, framework], index) => `${index + 1}. ${framework.label} (${key}) - ${framework.description}`)
    .join("\n");

  const rl = readline.createInterface({ input, output, terminal: true });
  try {
    const answer = await rl.question(
      [
        "",
        "SSO Bridge starter",
        "Choisis le framework a generer :",
        frameworkList,
        `Selection [${defaultFramework}]: `,
      ].join("\n")
    );

    const normalized = String(answer || "").trim().toLowerCase();
    if (!normalized) {
      return defaultFramework;
    }

    const selectedEntry = Object.entries(frameworks).find(
      ([key, framework], index) =>
        normalized === key || normalized === String(index + 1) || normalized === framework.label.toLowerCase()
    );

    return selectedEntry ? selectedEntry[0] : defaultFramework;
  } finally {
    rl.close();
    if (terminalStreams?.close) {
      terminalStreams.close();
    }
  }
}

async function scaffoldFramework(projectRoot, frameworkName) {
  const framework = frameworks[frameworkName];
  if (!framework) {
    throw new Error(`Framework inconnu: ${frameworkName}`);
  }

  const createdFiles = [];
  for (const [relativePath, contents] of Object.entries(framework.files)) {
    const targetPath = path.join(projectRoot, relativePath);
    const wasCreated = await writeFileIfMissing(targetPath, contents);
    if (wasCreated) {
      createdFiles.push(relativePath);
    }
  }

  let routesResult = null;
  if (frameworkName === "adonis") {
    routesResult = await updateAdonisRoutes(projectRoot);
    if (routesResult?.created) {
      createdFiles.push(path.relative(projectRoot, routesResult.path));
    }
  }

  await writeFileIfMissing(
    getSentinelPath(projectRoot),
    JSON.stringify(
      {
        framework: frameworkName,
        createdAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  return createdFiles;
}

async function runStarter(options = {}) {
  const projectRoot = getProjectRoot();
  const packageRoot = getPackageRoot();

  if (projectRoot === packageRoot) {
    return { skipped: true, reason: "local-package-development" };
  }

  const sentinelPath = getSentinelPath(projectRoot);
  if (!options.force && (await pathExists(sentinelPath))) {
    return { skipped: true, reason: "already-initialized" };
  }

  if (!options.framework && (process.env.CI || process.env.SSO_BRIDGE_SKIP_INIT === "1")) {
    return { skipped: true, reason: "non-interactive" };
  }

  const selectedFramework = options.framework || (await promptFramework(options.defaultFramework));

  if (!selectedFramework) {
    return { skipped: true, reason: "non-interactive" };
  }

  const createdFiles = await scaffoldFramework(projectRoot, selectedFramework);

  return {
    skipped: false,
    framework: selectedFramework,
    createdFiles,
    projectRoot,
  };
}

module.exports = {
  frameworks,
  runStarter,
};