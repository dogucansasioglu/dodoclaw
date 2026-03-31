const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

function timestamp(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

export const log = {
  info(msg: string) {
    console.log(`${colors.dim}${timestamp()}${colors.reset} ${colors.cyan}INFO${colors.reset}  ${msg}`);
  },
  ok(msg: string) {
    console.log(`${colors.dim}${timestamp()}${colors.reset} ${colors.green}OK${colors.reset}    ${msg}`);
  },
  warn(msg: string) {
    console.log(`${colors.dim}${timestamp()}${colors.reset} ${colors.yellow}WARN${colors.reset}  ${msg}`);
  },
  error(msg: string) {
    console.log(`${colors.dim}${timestamp()}${colors.reset} ${colors.red}ERROR${colors.reset} ${msg}`);
  },
  claude(msg: string) {
    console.log(`${colors.dim}${timestamp()}${colors.reset} ${colors.magenta}CLAUDE${colors.reset} ${msg}`);
  },
  debug(msg: string) {
    if (process.env.DEBUG) {
      console.log(`${colors.dim}${timestamp()} DEBUG ${msg}${colors.reset}`);
    }
  },
};
