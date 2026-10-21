import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { campusDate, campusMinutesNow, hoursLabel, isStallOpen, serviceDay } from "@/lib/hours";
import { getPickupSlots, isValidPickupSlot } from "@/lib/pickup-slots";

// Campus time is IST (UTC+05:30).
const ist = (hm: string, day = "2026-10-21") => new Date(`${day}T${hm}:00+05:30`);

describe("campus clock", () => {
  it("reads minutes and the date in IST, not the server's zone", () => {
    assert.equal(campusMinutesNow(ist("13:05")), 13 * 60 + 5);
    assert.equal(campusDate(ist("00:10", "2026-10-22")), "2026-10-22");
    // 23:00 UTC is already the next day on campus.
    assert.equal(campusDate(new Date("2026-10-21T23:00:00Z")), "2026-10-22");
  });

  it("labels and opens stalls by their hours", () => {
    assert.equal(hoursLabel("00:00", "23:59"), "Open 24 hours");
    assert.equal(hoursLabel("11:30", "15:00"), "11:30–15:00");
    assert.equal(isStallOpen("11:30", "15:00", ist("12:00")), true);
    assert.equal(isStallOpen("11:30", "15:00", ist("15:00")), false);
    assert.equal(isStallOpen("00:00", "23:59", ist("03:00")), true);
  });
});

describe("service day", () => {
  it("keeps a late-night shift on the evening's date until closing", () => {
    assert.equal(serviceDay("18:00", "02:00", ist("23:50", "2026-10-21")), "2026-10-21");
    assert.equal(serviceDay("18:00", "02:00", ist("01:30", "2026-10-22")), "2026-10-21");
    assert.equal(serviceDay("18:00", "02:00", ist("02:00", "2026-10-22")), "2026-10-22");
  });

  it("is the calendar date for day counters and 24-hour counters", () => {
    assert.equal(serviceDay("11:30", "15:00", ist("01:30", "2026-10-22")), "2026-10-22");
    assert.equal(serviceDay("00:00", "23:59", ist("00:05", "2026-10-22")), "2026-10-22");
  });
});

describe("pickup slots", () => {
  it("start about 10 minutes out on 15-minute boundaries", () => {
    const slots = getPickupSlots("08:00", "22:00", ist("12:07"));
    assert.equal(slots[0].value, "12:30");
    assert.ok(slots.every((s) => Number(s.value.slice(3)) % 15 === 0));
  });

  it("stop before closing time", () => {
    const slots = getPickupSlots("11:30", "15:00", ist("14:30"));
    assert.deepEqual(
      slots.map((s) => s.value),
      ["14:45"],
    );
    assert.deepEqual(getPickupSlots("11:30", "15:00", ist("14:55")), []);
  });

  it("wait for opening time when the stall opens later", () => {
    assert.equal(getPickupSlots("11:30", "15:00", ist("09:00"))[0].value, "11:30");
  });

  it("wrap past midnight for 24-hour stalls", () => {
    const values = getPickupSlots("00:00", "23:59", ist("23:50")).map((s) => s.value);
    assert.equal(values[0], "00:00");
    assert.ok(values.includes("01:00"));
  });

  it("handle counters that close after midnight", () => {
    assert.equal(hoursLabel("18:00", "02:00"), "18:00–02:00");
    assert.equal(isStallOpen("18:00", "02:00", ist("23:30")), true);
    assert.equal(isStallOpen("18:00", "02:00", ist("01:30")), true);
    assert.equal(isStallOpen("18:00", "02:00", ist("02:00")), false);
    assert.equal(isStallOpen("18:00", "02:00", ist("12:00")), false);
    const evening = getPickupSlots("18:00", "02:00", ist("23:40")).map((s) => s.value);
    assert.equal(evening[0], "00:00");
    assert.equal(evening.at(-1), "01:45");
    const late = getPickupSlots("18:00", "02:00", ist("01:20")).map((s) => s.value);
    assert.deepEqual(late, ["01:30", "01:45"]);
    assert.equal(getPickupSlots("18:00", "02:00", ist("16:00"))[0].value, "18:00");
    assert.deepEqual(getPickupSlots("18:00", "02:00", ist("03:00")).length > 0, true);
  });

  it("validate only offered slots", () => {
    const now = ist("12:07");
    assert.equal(isValidPickupSlot("12:30", "08:00", "22:00", now), true);
    assert.equal(isValidPickupSlot("12:15", "08:00", "22:00", now), false);
    assert.equal(isValidPickupSlot("23:00", "08:00", "22:00", now), false);
  });
});
