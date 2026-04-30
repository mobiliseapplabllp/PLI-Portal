const isDev = process.env.NODE_ENV !== 'production';

const COLORS = {
  reset: '\x1b[0m',
  dim:   '\x1b[2m',
  green: '\x1b[32m',
  yellow:'\x1b[33m',
  red:   '\x1b[31m',
  cyan:  '\x1b[36m',
  blue:  '\x1b[34m',
  magenta: '\x1b[35m',
};

const c = (color, text) => isDev ? `${COLORS[color]}${text}${COLORS.reset}` : text;

const ts = () => {
  const now = new Date();
  return c('dim', `[${now.toLocaleTimeString('en-IN', { hour12: false })}]`);
};

const logger = {
  info:    (...args) => console.log(ts(), c('cyan',    '[INFO]'),    ...args),
  success: (...args) => console.log(ts(), c('green',   '[OK]  '),    ...args),
  warn:    (...args) => console.warn(ts(), c('yellow',  '[WARN]'),    ...args),
  error:   (...args) => console.error(ts(), c('red',    '[ERROR]'),   ...args),
  db:      (...args) => console.log(ts(), c('magenta', '[DB]  '),    ...args),
  http:    (...args) => console.log(ts(), c('blue',    '[HTTP]'),    ...args),
};

module.exports = logger;
