const { formatDuration, getTrackAndTotalTracks } = require("./metadata");

describe("metadata", () => {
  it("should format duration", () => {
    expect(formatDuration(0.5865789)).toBe("0:00");
    expect(formatDuration(1.5865789)).toBe("0:01");
    expect(formatDuration(59)).toBe("0:59");
    expect(formatDuration(60)).toBe("1:00");
    expect(formatDuration(61)).toBe("1:01");
    expect(formatDuration(599)).toBe("9:59");
    expect(formatDuration(600)).toBe("10:00");
    expect(formatDuration(3599)).toBe("59:59");
    expect(formatDuration(3600)).toBe("01:00:00");
    expect(formatDuration(3601)).toBe("01:00:01");
    expect(formatDuration(3659)).toBe("01:00:59");
    expect(formatDuration(3660)).toBe("01:01:00");
    expect(formatDuration(3661)).toBe("01:01:01");
    expect(formatDuration(35990)).toBe("09:59:50");
    expect(formatDuration(71999)).toBe("19:59:59");
  });

  it("should format track", () => {
    const emptyResponse = { totalTracks: undefined, track: undefined };
    expect(getTrackAndTotalTracks()).toEqual(emptyResponse);
    expect(getTrackAndTotalTracks("")).toEqual(emptyResponse);
    expect(getTrackAndTotalTracks({ track: "" })).toEqual(emptyResponse);
    expect(getTrackAndTotalTracks({ track: 2 })).toEqual({
      totalTracks: undefined,
      track: "02",
    });
    expect(getTrackAndTotalTracks({ track: "1" })).toEqual({
      totalTracks: undefined,
      track: "01",
    });
    expect(getTrackAndTotalTracks({ track: "01" })).toEqual({
      totalTracks: undefined,
      track: "01",
    });
    expect(getTrackAndTotalTracks({ track: "1/9" })).toEqual({
      totalTracks: "9",
      track: "01",
    });
    expect(getTrackAndTotalTracks({ disc: 2, track: "1/9" })).toEqual({
      totalTracks: "9",
      track: "2.01",
    });
    expect(getTrackAndTotalTracks({ disc: "3", track: "13" })).toEqual({
      totalTracks: undefined,
      track: "3.13",
    });
    expect(getTrackAndTotalTracks({ disc: "1/3", track: "13" })).toEqual({
      totalTracks: undefined,
      track: "1.13",
    });
  });
});
