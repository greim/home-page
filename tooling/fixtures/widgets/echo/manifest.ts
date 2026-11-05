import { Schema } from "effect";
import { defineManifest } from "../../../../src/common/widgets.ts";

export const manifest = defineManifest({
  title: "Echo",
  description:
    "A test widget that echoes messages back. Used by the framework's integration tests.",
  config: Schema.Struct({ greeting: Schema.String }),
  defaultConfig: { greeting: "hello" },
});
