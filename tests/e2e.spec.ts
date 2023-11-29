import { ElectronApplication, Page, _electron as electron } from "playwright";
import { test, expect } from "@playwright/test";

let electronApp: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  electronApp = await electron.launch({ args: ["scripts/index.js"] });
  window = await electronApp.firstWindow();
  // Direct Electron renderer console to Node terminal.
  // window.on("console", console.log);
});

test.afterAll(async () => {
  await electronApp.close();
});

const getFilename = (name: string) => {
  return `tests/screenshots/${name}.png`;
};

test.describe("Library", () => {
  test.afterEach(async () => {
    await window.reload();
  });

  test("has Musa as Titlebar location", async () => {
    expect(await window.getByText("Musa").innerText()).toBe("Musa");
  });

  test("filters artists in library", async () => {
    await window.getByTestId("TitlebarLibraryButton").click();
    await window.screenshot({ path: getFilename("isLibraryVisible") });

    const filter = window.getByRole("textbox");
    await expect(filter).toBeVisible();

    await filter.fill("Ala");
    expect(await filter.inputValue()).toBe("Ala");
  });

  test("adds artist to playlist", async () => {
    await window.getByTestId("TitlebarLibraryButton").click();
    const artist = window.getByText("Alamaailman vasarat");
    const main = window.getByTestId("AppMainContainer");
    const playlist = window
      .getByTestId("PlaylistContainer")
      .getByRole("listitem");

    await artist.dragTo(main);

    expect((await playlist.all()).length).toBe(9);
    await window.screenshot({ path: getFilename("hasPlaylistItems") });
  });

  test("adds album to playlist", async () => {
    await window.getByTestId("TitlebarLibraryButton").click();
    const artist = window.getByText("Alamaailman vasarat");
    const main = window.getByTestId("AppMainContainer");

    await artist.click();

    const album = window.getByText("Valta");
    await album.dragTo(main);

    const playlistItems = await window
      .getByTestId("PlaylistContainer")
      .getByRole("listitem")
      .all();
    await window.screenshot({ path: getFilename("hasPlaylistItems2") });

    expect(playlistItems.length).toBe(9);
  });

  test("adds audio to playlist", async () => {
    await window.getByTestId("TitlebarLibraryButton").click();
    await window.getByText("Alamaailman vasarat").click();
    await window.getByTestId("AlbumCoverContainer").getByText("Valta").click();

    const audio = window
      .getByTestId("LibraryLibraryContainer")
      .getByText("Hirmuhallinto");
    // Drag doesn't work with Playwright for some reason
    await audio.dblclick();

    const playlistItems = await window
      .getByTestId("PlaylistContainer")
      .getByRole("listitem")
      .all();
    await window.screenshot({ path: getFilename("hasPlaylistItems3") });

    expect(playlistItems.length).toBe(1);
  });
});

test.describe("Visualizer", () => {
  test.beforeEach(async () => {
    await window.getByTestId("TitlebarVisualizerButton").click();
  });

  test.afterEach(async () => {
    await window.reload();
  });

  test("has visualizer canvases visible", async () => {
    expect(window.getByTestId("VisualizerBarCanvas")).toBeVisible();
    expect(window.getByTestId("VisualizerSpectroCanvas")).toBeVisible();
    expect(window.getByTestId("VisualizerPeakCanvas")).toBeVisible();
  });
});

test.describe("Search", () => {
  test.beforeAll(async () => {
    await window.getByTestId("TitlebarSearchButton").click();
  });

  test.afterEach(async () => {
    await window.reload();
  });

  test("has Search as Titlebar location", async () => {
    const location = await window.getByTestId("TitlebarLocation").innerText();
    const isSearchLocation = location === "Search" || location === "Haku";

    expect(isSearchLocation).toBe(true);
  });

  test("searches with search query input", async () => {
    const input = window.getByRole("textbox");

    await input.fill("Ala");
    await window.waitForTimeout(1000);

    expect(await input.inputValue()).toBe("Ala");
    expect(window.getByTestId("SearchAlbums").getByText("Valta")).toBeVisible();
    expect(
      window.getByTestId("SearchAudios").getByText("Väärä Käärme"),
    ).toBeAttached();
  });

  test("presses random and clear buttons", async () => {
    await window.getByTestId("SearchRandomButton").click();
    await window.waitForTimeout(1000);

    expect((await window.getByTestId("AlbumFullAdd").all()).length).toBe(8);
    expect((await window.getByTestId("SongContainer").all()).length).toBe(8);

    await window.getByTestId("SearchClearButton").click();

    expect((await window.getByTestId("AlbumFullAdd").all()).length).toBe(0);
    expect((await window.getByTestId("SongContainer").all()).length).toBe(0);
  });
});

test.describe("Settings", () => {
  test.beforeAll(async () => {
    await window.getByTestId("TitlebarSettingsButton").click();
  });

  test.afterEach(async () => {
    await window.reload();
  });

  test("has Settings as Titlebar location", async () => {
    const location = await window.getByTestId("TitlebarLocation").innerText();
    const isSettingsLocation =
      location === "Settings" || location === "Asetukset";

    expect(isSettingsLocation).toBe(true);
  });

  test("changes language to english", async () => {
    await window.getByTestId("LanguageSettingSelect").selectOption("en");

    expect(window.getByRole("heading", { name: "Library" })).toBeAttached();
    expect(window.getByText("Path")).toBeAttached();
    expect(window.getByRole("button", { name: "Add new" })).toBeAttached();

    expect(window.getByText("Advanced")).toBeAttached();
    expect(window.getByText("Normalization")).toBeAttached();
    expect(window.getByTestId("ReplaygainSettingSelect")).toBeAttached();
    expect(window.getByText("Actions")).toBeAttached();
    expect(
      window.getByRole("button", { name: "Update library" }),
    ).toBeAttached();

    expect(
      window.getByRole("heading", { name: "Theme", exact: true }),
    ).toBeAttached();
    expect(window.getByText("Collection")).toBeAttached();
    expect(
      window.getByRole("heading", { name: "Current theme" }),
    ).toBeAttached();
    expect(window.getByRole("button", { name: "Remove theme" })).toBeAttached();

    expect(window.getByText("Experimental")).toBeAttached();
    expect(window.getByText("Pre-amp dB")).toBeAttached();
    expect(window.getByTestId("PreAmpSettingInput")).toBeAttached();
    expect(window.getByText("Impulse response EQ")).toBeAttached();

    expect(window.getByText("Language")).toBeAttached();
  });

  test("changes language to finnish", async () => {
    await window.getByTestId("LanguageSettingSelect").selectOption("fi");

    expect(window.getByRole("heading", { name: "Kirjasto" })).toBeAttached();
    expect(window.getByText("Polku")).toBeAttached();
    expect(window.getByRole("button", { name: "Lisää uusi" })).toBeAttached();

    expect(window.getByText("Kehittyneet")).toBeAttached();
    expect(window.getByText("Normalisaatio")).toBeAttached();
    expect(window.getByTestId("ReplaygainSettingSelect")).toBeAttached();
    expect(window.getByText("Toiminnot")).toBeAttached();
    expect(
      window.getByRole("button", { name: "Päivitä kirjasto" }),
    ).toBeAttached();

    expect(
      window.getByRole("heading", { name: "Teema", exact: true }),
    ).toBeAttached();
    expect(window.getByText("Kokoelma")).toBeAttached();
    expect(
      window.getByRole("heading", { name: "Nykyinen teema" }),
    ).toBeAttached();
    expect(window.getByRole("button", { name: "Poista" })).toBeAttached();

    expect(window.getByText("Kokeelliset")).toBeAttached();
    expect(window.getByText("Esivahvistin dB")).toBeAttached();
    expect(window.getByTestId("PreAmpSettingInput")).toBeAttached();
    expect(window.getByText("Taajuusvastekorjain")).toBeAttached();

    expect(window.getByText("Kieli")).toBeAttached();
  });
});
