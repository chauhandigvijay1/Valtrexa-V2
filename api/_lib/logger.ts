let pinoModule: any;

try {
  pinoModule = (await import("pino")).default;
} catch {
  pinoModule = null;
}

const level = (process.env.LOG_LEVEL || "info").toLowerCase();

function buildPinoLogger() {
  try {
    return pinoModule({
      level,
      transport:
        process.env.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    });
  } catch {
    return null;
  }
}

const pinoLogger = pinoModule ? buildPinoLogger() : null;

export const logger = pinoLogger ?? {
  debug: (msg: any, ...args: any[]) => console.debug(msg, ...args),
  info: (msg: any, ...args: any[]) => console.info(msg, ...args),
  warn: (msg: any, ...args: any[]) => console.warn(msg, ...args),
  error: (msg: any, ...args: any[]) => console.error(msg, ...args),
  fatal: (msg: any, ...args: any[]) => console.error("FATAL:", msg, ...args),
  child: () => logger,
};
