import "server-only";

export function getAppVersion() {
  return (
    process.env.NEXT_PUBLIC_APP_VERSION ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    "local-development"
  );
}
