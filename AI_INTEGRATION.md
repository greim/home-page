# AI Integration

## Prerequisite Proposal: The Admin Bar

In _admin mode_, currently a "background" button appears in the bottom left of the viewport. Also, a
message appears bottom center of the viewport informing how to leave admin mode. These items float
over the UI, and aren't presented in a visually consistent way. All this makes for a poor UX.

These elements will be consolidated into an _admin bar_ that sits above the columns. The columns
will vertically shrink to make room for it. The spacing between the admin bar and the top of the
columns will be the same {gap} used elsewhere in the app layout. There will be no spacing between
the admin bar and the top of the viewport. The admin bar will have a white background and half-{gap}
squircled bottom-left and bottom right corners. It won't have a drop shadow.

Text messages in the admin bar will be vertically centered. The clickable region of a button will
cover the full vertical height of the bar. Between that and the lack of a gap above the bar, the
whole thing occupies minimal vertical real-estate.

## Proposal: The Admin Assistant

In _admin mode_, a new button will be added to the admin bar. Clicking it will launch a chat with
the Claude instance on the local machine. The purpose is to confiugure the home page on the user's
behalf, including anything it's possible for the user to do in admin mode, like modifying the
background, adding/modifying columns, or adding/modifying widgets.

_Superseded:_ the agent originally used _Unibrain_ as its only MCP server, to look up how the app's
configuration works and save what it learned. It now has no MCP servers: its prompt lists the widget
types and their config schemas, and the server's checks give it diagnostics. See
[SELF_BUILDING.md](./SELF_BUILDING.md).

The UI will support multi-turn chat, so the agent is free to ask the user for clarity and/or
details. The _action trigger_ is TBD. I'm open to suggestions on the best way for the agent to write
an updated config for the app. The goal is that if it succeeds, the agent will see that and know
it's done. If it fails, the agent sees an error diagnostic.
