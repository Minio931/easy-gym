import { describe, expect, it } from "vitest";
import { formatDuration, formatVolume, formatWeight, pluralPl, setsLabel } from "@/lib/format";

describe("formatDuration", () => {
  it("bez godzin pokazuje m:ss, z godzinami h:mm:ss", () => {
    expect(formatDuration(2535)).toBe("42:15");
    expect(formatDuration(3852)).toBe("1:04:12");
    expect(formatDuration(59)).toBe("0:59");
    expect(formatDuration(60)).toBe("1:00");
  });

  it("czas ujemny (zegar klienta do tyłu) to 0:00, nie minus", () => {
    expect(formatDuration(-5)).toBe("0:00");
  });
});

describe("formatVolume", () => {
  it("grupuje tysiące spacją nierozdzielającą", () => {
    expect(formatVolume(1950)).toBe("1 950");
    expect(formatVolume(960)).toBe("960");
    expect(formatVolume(124500)).toBe("124 500");
  });
});

describe("formatWeight", () => {
  it("nie pokazuje zer na końcu", () => {
    expect(formatWeight(100)).toBe("100");
    expect(formatWeight(102.5)).toBe("102.5");
  });
});

describe("pluralPl", () => {
  it("odmienia 1 / 2-4 / reszta", () => {
    expect(pluralPl(1, "seria", "serie", "serii")).toBe("seria");
    expect(pluralPl(3, "seria", "serie", "serii")).toBe("serie");
    expect(pluralPl(5, "seria", "serie", "serii")).toBe("serii");
  });

  it("nastolatki (12-14) idą do formy 'serii', nie 'serie'", () => {
    expect(pluralPl(12, "seria", "serie", "serii")).toBe("serii");
    expect(pluralPl(13, "seria", "serie", "serii")).toBe("serii");
    expect(pluralPl(22, "seria", "serie", "serii")).toBe("serie");
    expect(pluralPl(112, "seria", "serie", "serii")).toBe("serii");
    expect(pluralPl(0, "seria", "serie", "serii")).toBe("serii");
  });
});

describe("setsLabel", () => {
  it("skleja liczbę z odmianą", () => {
    expect(setsLabel(1)).toBe("1 seria");
    expect(setsLabel(3)).toBe("3 serie");
    expect(setsLabel(21)).toBe("21 serii");
  });
});
