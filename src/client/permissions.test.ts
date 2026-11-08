import { assertEquals } from "@std/assert";
import type { Permissions } from "../common/widgets.ts";
import { allowed, answerText, permissionKey, permissionState } from "./permissions.ts";

const geocoder: Permissions = {
  services: [{
    name: "Geocoder",
    sends: "Street addresses",
    privacyPolicy: "https://example.com/privacy",
    terms: "https://example.com/terms",
  }],
};

Deno.test("a widget that sends nothing needs no answer", () => {
  assertEquals(permissionState(null, null), { is: "not-needed" });
  assertEquals(allowed(permissionState(null, "anything")), true);
});

Deno.test("until it's answered, a widget with services isn't allowed", () => {
  assertEquals(permissionState(geocoder, null), { is: "unanswered", changed: false });
  assertEquals(permissionState(geocoder, "not json"), { is: "unanswered", changed: false });
  assertEquals(allowed(permissionState(geocoder, null)), false);
});

Deno.test("a yes allows it, and a no keeps it off", () => {
  assertEquals(permissionState(geocoder, answerText(geocoder, true)), { is: "granted" });
  assertEquals(allowed(permissionState(geocoder, answerText(geocoder, true))), true);
  assertEquals(permissionState(geocoder, answerText(geocoder, false)), { is: "declined" });
  assertEquals(allowed(permissionState(geocoder, answerText(geocoder, false))), false);
});

Deno.test("an answer about other services asks again", () => {
  const more: Permissions = {
    services: [...geocoder.services, { ...geocoder.services[0], name: "Map tiles" }],
  };
  assertEquals(permissionState(more, answerText(geocoder, true)), {
    is: "unanswered",
    changed: true,
  });
  const reworded: Permissions = { services: [{ ...geocoder.services[0], sends: "Names too" }] };
  assertEquals(permissionState(reworded, answerText(geocoder, false)), {
    is: "unanswered",
    changed: true,
  });
});

Deno.test("each widget type's answer has its own key", () => {
  assertEquals(permissionKey("radius-map"), "home-page.permissions.radius-map");
});
