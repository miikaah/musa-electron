import fs from "node:fs";
import path from "node:path";
import config from "./config";

const log = fs.createWriteStream(
  path.join(
    config.musadir,
    `${new Date().toISOString().split("T")[0].replaceAll("-", "")}-${
      config.isDevOrTest ? "dev-" : ""
    }musa.log`,
  ),
  {
    flags: "a",
  },
);

const toLines = (args: any[]) => {
  const startIndex =
    typeof args[0] === "string" && isValidDate(args[0]) ? 1 : 0;

  const lines = `[${new Date().toISOString()}] ${args
    .slice(startIndex)
    .map(
      (arg) =>
        `${
          typeof arg === "object"
            ? arg instanceof Error
              ? arg.message
              : JSON.stringify(arg)
            : String(arg).startsWith("\n")
              ? String(arg).substring(1)
              : arg
        }`,
    )
    .filter(Boolean)
    .join(" ")}`;

  return lines.startsWith("\n") ? lines : `\n${lines}`;
};

export const initLogger = () => {
  const originalConsoleLog = console.log;
  console.log = (...args: any[]) => {
    originalConsoleLog(...args);
    log.write(toLines(args));
  };

  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    originalConsoleError(...args);
    log.write(toLines(args));
  };

  const originalConsoleWarn = console.warn;
  console.warn = (...args: any[]) => {
    originalConsoleWarn(...args);
    log.write(toLines(args));
  };
};

function isValidDate(dateString: string) {
  return !isNaN(new Date(dateString).getTime());
}
