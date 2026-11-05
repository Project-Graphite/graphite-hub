import type { NextFunction, Request, Response } from 'express';

export function contentSecurityPolicy(nonce: string) {
  return Object.entries({
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${nonce}'`],
    'style-src': ["'self'", `'nonce-${nonce}'`],
    'style-src-attr': ["'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https://avatars.githubusercontent.com'],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
    'frame-src': [
      "'self'",
      'https://www.youtube-nocookie.com',
      'https://player.vimeo.com',
      'https://codepen.io',
      'https://www.figma.com',
      'https://www.loom.com',
    ],
    'form-action': ["'self'"],
    'frame-ancestors': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'upgrade-insecure-requests': [],
  })
    .map(([directive, sources]) => [directive, ...sources].join(' '))
    .join('; ');
}

export function securityHeaders(_request: Request, response: Response, next: NextFunction) {
  response.setHeader('Strict-Transport-Security', 'max-age=31536000');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader(
    'Permissions-Policy',
    'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  );
  response.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
}
