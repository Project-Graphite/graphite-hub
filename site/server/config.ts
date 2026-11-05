const production = process.env.NODE_ENV === 'production';
const devLogin = production ? undefined : process.env.DEV_LOGIN;

function required(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optional(name: string) {
  return process.env[name] || undefined;
}

export const config = {
  production,
  port: Number(process.env.PORT ?? 3000),
  appUrl: required('APP_URL'),
  dataDir: process.env.DATA_DIR ?? 'data',
  redisUrl: required('REDIS_URL'),
  sessionSecret: required('SESSION_SECRET'),
  organisation: process.env.GITHUB_ORG ?? 'Project-Graphite',
  platformRepo: process.env.PLATFORM_REPO ?? 'Project-Graphite/platform',
  dev: devLogin ? { login: devLogin, owner: process.env.DEV_ROLE !== 'member' } : undefined,
  oauth: devLogin
    ? undefined
    : { clientId: required('GITHUB_CLIENT_ID'), clientSecret: required('GITHUB_CLIENT_SECRET') },
  app: production
    ? {
        clientId: required('PLATFORM_APP_CLIENT_ID'),
        privateKey: required('PLATFORM_APP_PRIVATE_KEY'),
      }
    : undefined,
  githubToken: production ? undefined : optional('GITHUB_TOKEN'),
  webhookSecret: production ? required('GITHUB_WEBHOOK_SECRET') : optional('GITHUB_WEBHOOK_SECRET'),
  deployReportSecret: production
    ? required('DEPLOY_REPORT_SECRET')
    : optional('DEPLOY_REPORT_SECRET'),
  smtpUrl: optional('SMTP_URL'),
  alertsEmail: optional('ALERTS_EMAIL'),
  alertsFrom: optional('ALERTS_FROM'),
};
