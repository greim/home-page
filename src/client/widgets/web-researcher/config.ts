/** The web researcher's config, just a heading, and its agent's report. */
import { Schema } from "effect";

export const WebResearcherConfig = Schema.Struct({
  /** Shown above the widget. None when blank. */
  heading: Schema.optionalWith(Schema.String, { default: () => "" }),
});
export type WebResearcherConfig = typeof WebResearcherConfig.Type;

export const ResearchReport = Schema.Struct({
  title: Schema.String.annotations({ description: "A short title for the report" }),
  summary: Schema.String.annotations({
    description: "The answer to the topic in a paragraph, for someone short on time",
  }),
  sections: Schema.Array(Schema.Struct({
    heading: Schema.String,
    body: Schema.String.annotations({
      description: "Plain text paragraphs, separated by blank lines; cite sources as [1], [2]",
    }),
  })),
  sources: Schema.Array(Schema.Struct({
    title: Schema.String,
    url: Schema.String.annotations({ description: "The page's https URL" }),
  })).annotations({ description: "The sources cited, numbered in this order from [1]" }),
});
export type ResearchReport = typeof ResearchReport.Type;

/** A source's site, for showing next to it: https://www.example.com/a → example.com. */
export const siteOf = (url: string): string => {
  const host = /^https?:\/\/([^/?#]+)/i.exec(url)?.[1] ?? "";
  return host.replace(/^www\./i, "");
};

/** Only http(s) links are shown as links: the agent's answer is untrusted. */
export const isWebLink = (url: string): boolean => /^https?:\/\//i.test(url);
