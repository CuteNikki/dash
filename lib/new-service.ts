import { z } from 'zod';

/**
 * A new service: its name, which names its folder (~/services/<name>), its
 * compose project and its Caddy site file; its compose file and .env; and,
 * for a site, the domain Caddy serves and which of its services, on which
 * port, it sends that to.
 */

/** The network Caddy reaches services on, which a site's service must join. */
export const CADDY_NETWORK = 'caddy';

/** As Compose takes a project name: lowercase letters, digits, - and _. */
const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const MAX_NAME = 40;

const DOMAIN_PATTERN =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export const NewService = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Give it a name')
      .max(MAX_NAME, `Up to ${MAX_NAME} characters`)
      .regex(
        NAME_PATTERN,
        'Lowercase letters, digits, - and _, starting with a letter or digit'
      ),
    compose: z.string().trim().min(1, 'It needs a compose file'),
    env: z.string(),
    domain: z
      .string()
      .trim()
      .toLowerCase()
      .refine((d) => !d || DOMAIN_PATTERN.test(d), 'That isn’t a domain'),
    service: z.string().trim(),
    port: z.string().trim(),
  })
  .superRefine((input, ctx) => {
    if (!input.domain) return;
    if (!input.service) {
      ctx.addIssue({
        code: 'custom',
        path: ['service'],
        message: 'Which service answers the domain',
      });
    }
    const port = Number(input.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      ctx.addIssue({
        code: 'custom',
        path: ['port'],
        message: 'A port from 1 to 65535',
      });
    }
  });

export type NewServiceInput = z.input<typeof NewService>;
export type NewServiceData = z.output<typeof NewService>;
