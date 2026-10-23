import { mock } from 'bun:test';

// `import 'server-only'` throws anywhere but Next's server, which a test isn't
mock.module('server-only', () => ({}));
