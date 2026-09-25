import { mkdirSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { eventSchema } from "../src/schema";

mkdirSync(new URL("../schema/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../schema/event.schema.json", import.meta.url),
  `${JSON.stringify(z.toJSONSchema(eventSchema), null, 2)}\n`,
);
