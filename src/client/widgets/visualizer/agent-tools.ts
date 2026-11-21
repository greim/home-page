/**
 * The visualizer agent's own tools. They run in Deno, sandboxed to the run's folder
 * (see src/common/agent-tools.ts), never in the page: the user's data is in
 * in/data.json, and the chart goes in out/ (spec.json, chart.svg, and
 * data.json when the agent read the rows from text itself).
 */
import { Either, Schema } from "effect";
import { agentTool, defineAgentTools, type RunFolder } from "../../../common/agent-tools.ts";
import { renderChart } from "./chart.ts";
import { maxRows, type Rows } from "./data.ts";
import { overview } from "./overview.ts";

const Value = Schema.Union(Schema.String, Schema.Number, Schema.Boolean, Schema.Null);
const RowsInput = Schema.Array(Schema.Record({ key: Schema.String, value: Value }));

const readRows = async (folder: RunFolder): Promise<Rows | null> => {
  const text = await Deno.readTextFile(folder.path("in/data.json")).catch(() => null);
  return text === null ? null : Schema.decodeUnknownSync(RowsInput)(JSON.parse(text));
};

/** The spec as an object, parsing it if it was sent as JSON text anyway. */
export const specObject = (sent: unknown): unknown =>
  typeof sent === "string"
    ? Either.getOrElse(Either.try((): unknown => JSON.parse(sent)), () => sent)
    : sent;

export const tools = defineAgentTools({
  data_overview: agentTool({
    description: "Describes the user's data (in/data.json): how many rows, each field's type " +
      "(number, date, boolean, text), missing and distinct values, ranges, commonest values, " +
      "and the first rows.",
    input: Schema.Struct({}),
    run: async (_input, folder) => {
      const rows = await readRows(folder);
      if (rows === null) {
        throw new Error("There's no in/data.json: the data came as text or an image.");
      }
      return overview(rows);
    },
  }),
  render_chart: agentTool({
    description: "Renders a Vega-Lite spec as the chart, against the user's data, and keeps " +
      'it as the chart\'s new version. The data is always the dataset named "dump" (set for ' +
      "you); leave out data, title, width, height, autosize and colors' config. Returns what " +
      "Vega warned about; throws with Vega's message when the spec can't be rendered. Pass rows " +
      "only when the data came as text or an image and you read the rows from it yourself.",
    input: Schema.Struct({
      // Typed as an object for the agent: with no type, it sends the spec as a JSON string.
      spec: Schema.Unknown.annotations({
        jsonSchema: { type: "object", description: "The Vega-Lite spec (v6), as a JSON object" },
      }),
      rows: Schema.optionalWith(RowsInput, { exact: true }).annotations({
        description: "Rows you read from the text or image, when there's no in/data.json",
      }),
    }),
    run: async ({ spec: sent, rows: given }, folder) => {
      const spec = specObject(sent);
      const rows = given ?? await readRows(folder);
      if (rows === null) {
        throw new Error("There's no in/data.json: pass the rows you read from the text or image.");
      }
      if (rows.length > maxRows) throw new Error(`At most ${maxRows} rows can be charted.`);
      const rendered = await renderChart(spec, rows);
      if (Either.isLeft(rendered)) throw new Error(rendered.left);
      await Deno.mkdir(folder.path("out"), { recursive: true });
      await Deno.writeTextFile(folder.path("out/spec.json"), JSON.stringify(spec));
      await Deno.writeTextFile(folder.path("out/chart.svg"), rendered.right.svg);
      if (given !== undefined) {
        await Deno.writeTextFile(folder.path("out/data.json"), JSON.stringify(given));
      }
      return { rendered: true, rows: rows.length, warnings: rendered.right.warnings };
    },
  }),
});
