# SSO Bridge

## Description
Ce package fournit des helpers SSO orientés AdonisJS tout en conservant un coeur agnostique au framework.

## Ce Que Vous Obtenez

- Un coeur SSO agnostique au framework (`src/core/sso-bridge.js`) pour generer des correlation IDs, construire les URLs de redirection SSO, verifier les resultats de callback et construire les URLs de logout.
- Une couche d'integration Adonis (`src/adonis/handlers.js`) avec des handlers prets a l'emploi pour login redirect, callback et logout.
- Des exports CommonJS via `src/index.js`.

## Compatibilité Framework

- AdonisJS: couche de helpers native incluse.
- Autres frameworks Node.js (Express, Fastify, NestJS, Koa): utilisez directement la classe core et branchez-la sur vos routes et votre système de session.

## Installation

1. Installez le package dans votre projet :
   ```bash
   npm install git+https://github.com/ETML-INF/SSO-Bridge.git
   ```
2. Ajoutez les variables d'environnement dans `.env` :
   ```env
   API_KEY=YOUR_SSO_API_KEY
   SSO_PORTAL=https://your-sso-portal.example.com/auth/
   ```

## Utilisation avec AdonisJS (v6+)

### 1) Exemple de service SSO Bridge

```ts
import ssoBridgePackage from 'sso-bridge'
import env from '#start/env'

// On définit l'interface pour avoir l'autocomplétion et éviter les erreurs
interface SsoBridge {
  generateCorrelationId(): Promise<string>
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
  const ssoPortal = env.get('SSO_PORTAL')

  if (!apiKey) {
    throw new Error('API_KEY (Bridge Token) manquante dans le .env')
  }

  // @ts-ignore - On cast pour utiliser les méthodes du SDK
  return ssoBridgePackage.createSSOBridge({
    apiKey: apiKey,
    ssoPortal: ssoPortal,
  })
}
```

### 2) Exemple de controller SSO

```ts
// app/controllers/sso_test_controller.ts
import type { HttpContext } from "@adonisjs/core/http";
import { randomBytes } from "node:crypto";
import Hash from "@adonisjs/core/services/hash";
import { createBridgeFromEnv } from "#services/sso_bridge_service";
import env from "#start/env";
import User from "#models/user";

type SsoResult = {
  email: string;
  username: string;
  error?: string;
  isSuccess: () => boolean;
};

export default class SsoTestController {
  private getPortalUrl() {
    return (env.get("SSO_PORTAL") || "").replace(/\/$/, "");
  }
  private getAppUrl() {
    return (env.get("APP_URL") || "http://127.0.0.1:3333").replace(/\/$/, "");
  }

  /**
   * GET /sso/test : Affiche l'état SSO
   */
  public async status({ response }: HttpContext) {
    const apiKey = env.get("API_KEY");
    const appUrl = this.getAppUrl();
    return response.ok({
      status: "ok",
      apiKeyPresent: !!apiKey,
      message: apiKey ? "API_KEY détectée." : "API_KEY manquante dans .env",
      links: {
        login: `${appUrl}/sso/login`,
        callback: `${appUrl}/sso/callback?correlationId=XXX`,
        logout: `${appUrl}/sso/logout`,
      },
    });
  }

  /**
   * PHASE 1 : Redirection vers le portail SSO
   */
  public async loginRedirect({ response }: HttpContext) {
    const bridge = createBridgeFromEnv() as any;
    const cid = await bridge.generateCorrelationId();
    const portal = this.getPortalUrl();
    const callbackUrl = `${this.getAppUrl()}/sso/callback?correlationId=${cid}`;
    const finalUrl = `${portal}/redirect?correlationId=${cid}&redirectUri=${encodeURIComponent(callbackUrl)}`;
    return response.redirect(finalUrl);
  }

  /**
   * PHASE 2 : Retour du portail SSO & Validation
   */
  public async callback({ request, session, response, auth }: HttpContext) {
    const cid = request.input("correlationId");
    if (!cid) return response.badRequest("CID manquant");
    try {
      const apiKey = env.get("API_KEY");
      const portal = this.getPortalUrl();
      const baseUrl = portal.endsWith("/auth") ? portal : `${portal}/auth`;
      const bridgeUrl = `${baseUrl}/bridge/check?token=${apiKey}&correlationId=${cid}`;
      const apiResponse = await fetch(bridgeUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const ssoResult = (await apiResponse.json()) as any;
      if (ssoResult.error || !ssoResult.email) {
        session.flash({
          error: `Erreur : ${ssoResult.error || "User inconnu"}`,
        });
        return response.redirect("/login");
      }
      // Connexion
      const user = await this.findOrCreateSsoUser(ssoResult);
      await auth.use("web").login(user);
      return response.redirect("/home");
    } catch (error) {
      return response.internalServerError(`Erreur : ${error.message}`);
    }
  }

  /**
   * PHASE 3 : Déconnexion (Locale + Portail)
   */
  public async logout({ auth, response }: HttpContext) {
    await auth.use("web").logout();
    const portal = this.getPortalUrl();
    const appUrl = this.getAppUrl();
    const postLogoutUrl = encodeURIComponent(
      appUrl.endsWith("/") ? appUrl : appUrl + "/",
    );
    return response.redirect(`${portal}/logout?redirectUri=${postLogoutUrl}`);
  }

  // --- Utilitaires internes pour gestion User ---
  private async findOrCreateSsoUser(payload: SsoResult) {
    const email = payload.email?.trim().toLowerCase() || null;
    const usernameFromSso = payload.username?.trim() || "";
    let user = email ? await User.findBy("email", email) : null;
    if (!user && usernameFromSso) {
      user = await User.findBy("Username", usernameFromSso);
    }
    if (user) return user;
    const baseUsername = this.normalizeUsername(email || usernameFromSso);
    const username = await this.makeUniqueUsername(baseUsername);
    const password = await Hash.make(randomBytes(32).toString("hex"));
    return User.create({
      Username: username,
      email,
      password,
      extainre: false,
      isadmin: false,
    });
  }
  private normalizeUsername(rawEmail: string) {
    const localPart = rawEmail.includes("@")
      ? rawEmail.split("@")[0]
      : rawEmail;
    const cleaned = localPart
      .trim()
      .replace(/\./g, "-")
      .replace(/[^a-zA-Z0-9_-]/g, "");
    return (cleaned || "sso_user").slice(0, 40);
  }
  private async makeUniqueUsername(baseUsername: string) {
    let candidate = baseUsername;
    let suffix = 1;
    while (await User.findBy("Username", candidate)) {
      candidate = `${baseUsername}_${suffix}`.slice(0, 40);
      suffix += 1;
    }
    return candidate;
  }
}
```

### 3) Déclarer les routes

```ts
// start/routes.ts
import router from "@adonisjs/core/services/router";
import SsoTestController from "#controllers/sso_test_controller";

router.get("/sso/test", [SsoTestController, "status"]);
router.get("/sso/login", [SsoTestController, "loginRedirect"]);
router.get("/sso/callback", [SsoTestController, "callback"]);
router.get("/sso/logout", [SsoTestController, "logout"]);
```

## Exemple d'utilisation Générique (Tout Framework)

```js
const { createSSOBridge } = require("sso-bridge");
const bridge = createSSOBridge({
  apiKey: process.env.API_KEY,
  ssoPortal: process.env.SSO_PORTAL, // .env: SSO_PORTAL=https://your-sso-portal.example.com/auth/
});
async function startLogin(session, callbackUrl) {
  const cid = await bridge.generateCorrelationId();
  session.sso_bridge_correlation_id = cid;
  return bridge.buildLoginRedirectUrl(cid, callbackUrl);
}
async function handleCallback(session) {
  const cid = session.sso_bridge_correlation_id;
  return bridge.retrieveLoginInfo(cid);
}
```

## Notes

- `src/core/sso-bridge.js` contient la logique réutilisable indépendante d'Adonis.
- `src/adonis/handlers.js` fournit des helpers de controller prêts à l'emploi pour les contextes Adonis.
- Nécessite Node.js 18+ pour `fetch` natif.
