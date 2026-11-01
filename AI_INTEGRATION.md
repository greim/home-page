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

The only MCP server the agent will have is _Unibrain_. If the agent doesn't know how the app's
configuration scheme works, it should consult Unibrain. If it can't find that information, it should
do the work to get that info, and when it gains clarity, save the insights in Unibrain. If it sees
an opportunity to automate tasks that are repetitive and deterministic — such as validating a
configuration before save — it should consult Unibrain to see if a program exists for that. If it
doesn't, it should write it and save it to Unibrain for future use. If it finds outdated info, wrong
info, or buggy programs in Unibrain, it should proactively correct them. The first time the user
uses this feature, it may be slow and cumbersome, but over time, it should become significantly
faster and cheaper token-wise, due to the accumulation of knowledge and capabilities stored in
Unibrain.

The UI will support multi-turn chat, so the agent is free to ask the user for clarity and/or
details. The _action trigger_ is TBD. I'm open to suggestions on the best way for the agent to write
an updated config for the app. The goal is that if it succeeds, the agent will see that and know
it's done. If it fails, the agent sees an error diagnost and can consult Unibrain regarding the
error details.
