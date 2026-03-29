# JWT Rotation Deployment Steps

This project now supports safe JWT secret rotation without forcing immediate logout for all users.

## What was implemented

- Backend verifies tokens with JWT_SECRET first, then optionally JWT_SECRET_PREVIOUS during transition.
- Startup logs show whether rotation mode is active.
- A helper command generates a new secret and prints deployment values.

## Run helper locally

From project root:

- cd backend
- npm run jwt:rotation

This prints:

- New JWT secret for production JWT_SECRET
- Suggested JWT_SECRET_PREVIOUS value (current local JWT_SECRET)
- Expiry values to keep

## Production rollout

1. In your backend hosting environment (Render), set:
   - JWT_SECRET=<new secret from helper>
   - JWT_SECRET_PREVIOUS=<current production JWT_SECRET>
   - WEB_ACCESS_TOKEN_EXPIRES_IN=14d
   - MOBILE_ACCESS_TOKEN_EXPIRES_IN=180d
2. Redeploy backend.
3. Wait 1-2 weeks transition window.
4. Remove JWT_SECRET_PREVIOUS from production env.
5. Redeploy backend again.

## Post-deploy checks

Check backend startup logs:

- During transition: JWT_SECRET_PREVIOUS: set (rotation mode active)
- After cleanup: JWT_SECRET_PREVIOUS: not set

If logins fail unexpectedly after Step 1, verify JWT_SECRET_PREVIOUS exactly matches the old production JWT_SECRET (no extra spaces/newlines).
