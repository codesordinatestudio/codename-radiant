import { createRadiant } from "./radiant/runtime";
import { sqlite } from "@codesordinatestudio/radiant-plugin-sqlite";
import { nodemailerEmail } from "@codesordinatestudio/radiant-plugin-nodemailer";

export const app = createRadiant({
  adapter: sqlite({ url: "file:./temp/radiant.db" }),
  email: {
    transport: nodemailerEmail({
      host: "localhost",
      port: 1025,
      auth: {
        user: "mailpit",
        pass: "mailpit",
      },
    }),
  },
});
