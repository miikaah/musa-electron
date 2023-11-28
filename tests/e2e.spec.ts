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
