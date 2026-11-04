/** A test MFE: echoes messages, and relays one to the shell. */
import { registerMfe } from "../../../../src/client/mfe/register-live.tsx";

registerMfe("echo", (shell) => {
  shell.receive("echo", (message) => ({ echoed: message }));
  shell.receive("ask-shell", (message) => shell.send({ channel: "answer", message }));
  return { widget: ({ props }) => <p>{String(props)}</p> };
});
