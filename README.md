# SSO Bridge

## Description
Ce package fournit des helpers SSO orientés AdonisJS tout en conservant un coeur agnostique au framework.

## Ce Que Vous Obtenez
- Un coeur SSO agnostique au framework (`src/core/sso-bridge.js`) pour generer des correlation IDs, construire les URLs de redirection SSO, verifier les resultats de callback et construire les URLs de logout.
- Une couche d'integration Adonis (`src/adonis/handlers.js`) avec des handlers prets a l'emploi pour login redirect, callback et logout.
- Des exports CommonJS via `src/index.js`.

## Compatibilite Framework
- AdonisJS: couche de helpers native incluse.
- Autres frameworks Node.js (Express, Fastify, NestJS, Koa): utilisez directement la classe core et branchez-la sur vos routes et votre systeme de session.

## Installation
1. Installez les dependances du package dans votre projet:
	 npm install
2. Ajoutez les variables d'environnement:
	 API_KEY=YOUR_SSO_API_KEY
	 SSO_PORTAL=https://apps.pm2etml.ch/auth/

## Utilisation Adonis

### 1) Creer un service bridge
```js
// app/services/sso_bridge_service.js
const { createSSOBridge } = require("sso-bridge")

const bridge = createSSOBridge({
	apiKey: process.env.API_KEY,
	ssoPortal: process.env.SSO_PORTAL,
})

module.exports = bridge
```

### 2) Creer un controller
```js
// app/controllers/sso_controller.js
const bridge = require("../services/sso_bridge_service")
const { createAdonisSSOHandlers } = require("sso-bridge")

const handlers = createAdonisSSOHandlers(bridge, {
	sessionKey: "sso_bridge_correlation_id",
	callbackPath: "/sso/callback",
	afterLogoutPath: "/",
})

class SsoController {
	async loginRedirect(ctx) {
		// Parametres passthrough optionnels disponibles dans la query string du callback.
		return handlers.loginRedirect(ctx, { homepage: "home" })
	}

	async callback(ctx) {
		const result = await handlers.callback(ctx)
		if (result && result.error) {
			return result
		}

		// TODO: mapper result.email / result.username sur votre utilisateur local et le connecter.
		return ctx.response.send({ success: true, user: result })
	}

	logout(ctx) {
		return handlers.logout(ctx)
	}
}

module.exports = SsoController
```

### 3) Definir les routes
```js
// start/routes.js
const Route = use("Route")

Route.get("/sso/login", "SsoController.loginRedirect")
Route.get("/sso/callback", "SsoController.callback")
Route.get("/sso/logout", "SsoController.logout")
```

## Utilisation Generique (Tout Framework)
```js
const { createSSOBridge } = require("sso-bridge")

const bridge = createSSOBridge({
	apiKey: process.env.API_KEY,
	ssoPortal: process.env.SSO_PORTAL,
})

async function startLogin(session, callbackUrl) {
	const cid = await bridge.generateCorrelationId()
	session.sso_bridge_correlation_id = cid
	return bridge.buildLoginRedirectUrl(cid, callbackUrl)
}

async function handleCallback(session) {
	const cid = session.sso_bridge_correlation_id
	return bridge.retrieveLoginInfo(cid)
}
```

## Notes
- `src/core/sso-bridge.js` contient la logique reutilisable independante d'Adonis.
- `src/adonis/handlers.js` fournit des helpers de controller prets a l'emploi pour les contextes Adonis.
- Necessite Node.js 18+ pour `fetch` natif.

