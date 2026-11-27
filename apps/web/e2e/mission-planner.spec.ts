import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Mission Planner smoke test (Requirement 10.7).
 *
 * Live NOAA/CelesTrak feeds are not reachable in CI, so live-mode `/api/assess` and
 * `/api/forecast` calls are intercepted. Each one is answered with the real engine output for
 * the archived Gannon scenario at the same coordinates (computed by the running app, no
 * network), relabelled as non-replay, with a fixed level per location so the Decision_Card
 * result is deterministic. Replay-mode calls go to the real routes untouched.
 */

const REPLAY_ID = "gannon-2024";
const IOWA_LAT = "41.878";

type Json = Record<string, unknown>;

function stripReplay(a: Json): void {
  a.isReplay = false;
  delete a.replayLabel;
  delete a.replayArchiveIso;
}

/** Fixture level per location: Iowa Corn Belt reads HOLD, everything else CAUTION. */
function levelFor(lat: string | null): { level: string; score: number } {
  return lat === IOWA_LAT ? { level: "Haunted", score: 80 } : { level: "Uneasy", score: 50 };
}

async function serveLiveFixture(route: Route): Promise<void> {
  const url = new URL(route.request().url());
  if (url.searchParams.has("replay")) {
    await route.continue();
    return;
  }
  const replayUrl = new URL(url);
  replayUrl.searchParams.set("replay", REPLAY_ID);
  const upstream = await route.fetch({ url: replayUrl.toString() });
  const body = (await upstream.json()) as Json;
  const fixed = levelFor(url.searchParams.get("lat"));

  if (url.pathname.endsWith("/api/assess")) {
    const a = body.assessment as Json;
    stripReplay(a);
    a.level = fixed.level;
    a.score = fixed.score;
    delete body.summary;
  } else {
    stripReplay(body);
    for (const h of body.hours as Json[]) stripReplay(h.assessment as Json);
  }
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

async function openPlanner(page: Page): Promise<void> {
  // No third-party traffic (map tiles, geocoder) during the test.
  await page.route(
    (u) => u.hostname !== "localhost" && u.hostname !== "127.0.0.1",
    (r) => r.abort()
  );
  await page.route(/\/api\/(assess|forecast)\?/, serveLiveFixture);
  await page.goto("/");
  await expect(page.getByTestId("hero")).toBeVisible();
}

test.describe("Mission Planner", () => {
  // Requests still in flight when a test ends must not fail it.
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("hero renders both call-to-action buttons", async ({ page }) => {
    await openPlanner(page);
    const hero = page.getByTestId("hero");
    await expect(hero).toContainText("Solar storms silently break RTK GPS");
    await expect(page.getByTestId("hero-check-live")).toBeEnabled();
    await expect(page.getByTestId("hero-check-live")).toHaveText(/Check My Field \(Live\)/);
    await expect(page.getByTestId("hero-replay")).toBeEnabled();
    await expect(page.getByTestId("hero-replay")).toHaveText(/Replay May 2024 Disaster/);
  });

  test("replay shows the REPLAY badge with archive timestamp, and leaving replay removes it", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("hero-replay").click();

    const decisionBadge = page.getByTestId("replay-badge-decision");
    await expect(decisionBadge).toBeVisible();
    await expect(decisionBadge).toContainText("REPLAY");
    await expect(decisionBadge).toContainText(/\(UTC\): \d{4}-\d{2}-\d{2}T/);
    await expect(page.getByTestId("replay-badge-timeline")).toContainText("REPLAY");

    await page.getByTestId("hero-check-live").click();
    await expect(page.getByTestId("selected-hour")).toContainText("Showing now");
    await expect(page.getByTestId("safe-window-timeline")).toContainText("Next 12 hours");
    await expect(decisionBadge).toHaveCount(0);
    await expect(page.getByTestId("replay-badge-timeline")).toHaveCount(0);
  });

  test("selecting a preset updates the Decision Card", async ({ page }) => {
    await openPlanner(page);
    const card = page.getByRole("region", { name: "Decision" });
    await expect(card).toContainText("CAUTION — Watch for Drift");

    const iowaRequest = page.waitForRequest(
      (r) => r.url().includes("/api/assess?") && new URL(r.url()).searchParams.get("lat") === IOWA_LAT
    );
    await page
      .getByRole("region", { name: "Preset locations" })
      .getByRole("button", { name: /Iowa Corn Belt/ })
      .click();
    await iowaRequest;

    await expect(card).toContainText("HOLD — High Risk of RTK Loss");
    await expect(card).not.toContainText("CAUTION — Watch for Drift");
  });

  test("clicking a timeline bar changes the selected hour", async ({ page }) => {
    await openPlanner(page);
    await page.getByTestId("hero-replay").click();
    await expect(page.getByTestId("replay-badge-timeline")).toBeVisible();

    const timeline = page.getByTestId("safe-window-timeline");
    await expect(timeline.getByRole("button")).toHaveCount(12);
    await expect(page.getByTestId("hour-bar-0")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("selected-hour")).toContainText("the archive hour");

    await page.getByTestId("hour-bar-3").click();
    await expect(page.getByTestId("hour-bar-3")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("hour-bar-0")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("selected-hour")).toContainText("+3 h");
    await expect(page.getByTestId("selected-hour")).toContainText("projection");
  });
});
