const { formatDuration } = require("./metadata");

describe("metadata", () => {
  it("should format duration", () => {
    expect(formatDuration(0.5865789)).toBe("00:00");
    expect(formatDuration(1.5865789)).toBe("00:01");
    expect(formatDuration(60)).toBe("01:00");
    expect(formatDuration(61)).toBe("01:01");
    expect(formatDuration(59)).toBe("00:59");
    expect(formatDuration(3600)).toBe("01:00:00");
    expect(formatDuration(3601)).toBe("01:00:01");
    expect(formatDuration(3660)).toBe("01:01:00");
    expect(formatDuration(3661)).toBe("01:01:01");
    expect(formatDuration(3599)).toBe("59:59");
    expect(formatDuration(35990)).toBe("09:59:50");
    expect(formatDuration(71999)).toBe("19:59:59");
  });
});
